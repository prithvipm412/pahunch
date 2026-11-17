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
type TimerHandle = ReturnType<typeof setTimeout>
const pendingTimers = new Set<TimerHandle>()
let sonifyTimer: TimerHandle | null = null

// The HTMLAudioElement actually playing right now (set once startPlayback() calls .play(),
// cleared on finish) — lets stopAllUnlessAlmostDone() check how much of it is left before
// deciding whether to interrupt it.
let currentAudioElement: HTMLAudioElement | null = null

// A short delay added before every clip actually starts, so the device's audio output path is
// already "awake" by the time the recording's own first consonant plays — without it, real
// Android/Chrome hardware was observed clipping the very start of a clip (e.g. "wire" heard as
// "ire").
const LEADING_SILENCE_MS = 100

// speechSynthesis.cancel() immediately followed by .speak() in the same tick is a known source
// of glitchy/cut-off speech on real devices; this tracks the last cancel() so the next speak()
// can wait out the remainder of this gap first.
let lastSpeechCancelAt = 0
const SPEECH_CANCEL_GAP_MS = 120

function cancelSpeechSynthesis(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  lastSpeechCancelAt = Date.now()
}

// Picked once per language and cached — getVoices() can be a non-trivial/async-loaded call on
// some browsers, and re-running the search on every utterance is wasted work. Left uncached
// (null) until a non-empty voice list is seen, so a browser that loads voices lazily gets
// re-checked instead of permanently locking in "no voice found".
let cachedVoices: { en?: SpeechSynthesisVoice; kn?: SpeechSynthesisVoice } | null = null

function pickVoice(lang: 'en' | 'kn'): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined
  if (!cachedVoices?.en && !cachedVoices?.kn) {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      cachedVoices = {
        en: voices.find((v) => v.lang === 'en-IN') ?? voices.find((v) => v.lang.toLowerCase().startsWith('en')),
        kn: voices.find((v) => v.lang === 'kn-IN') ?? voices.find((v) => v.lang.toLowerCase().startsWith('kn')),
      }
    }
  }
  return cachedVoices?.[lang]
}

let voiceWarmedUp = false

/** Warms up speechSynthesis on the first user gesture, so the very first real clip's fallback
 * isn't also the utterance that has to cold-start the TTS engine. Idempotent — safe to call on
 * every gesture, not just the first. */
export function warmUpVoice(): void {
  if (voiceWarmedUp) return
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  voiceWarmedUp = true
  try {
    window.speechSynthesis.getVoices() // triggers lazy voice-list loading on some browsers
    const warmup = new SpeechSynthesisUtterance('')
    warmup.volume = 0
    window.speechSynthesis.speak(warmup)
  } catch { /* Speech synthesis warm-up is best-effort. */ }
}

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
    let leadingSilenceTimer: TimerHandle | null = null
    const finish = () => {
      if (settled) return
      settled = true
      audio.removeEventListener('ended', finish)
      audio.removeEventListener('error', onError)
      if (leadingSilenceTimer !== null) {
        clearTimeout(leadingSilenceTimer)
        pendingTimers.delete(leadingSilenceTimer)
        leadingSilenceTimer = null
      }
      if (currentAudioElement === audio) currentAudioElement = null
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

    const startPlayback = () => {
      if (settled || task.generation !== generation) { finish(); return }
      currentAudioElement = audio
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
        try { await speakFallback(task.fallbackText, task.lang, task.generation) } catch { /* Speech fallback is optional. */ }
        finish()
      }) } catch {
        console.warn(`Audio clip missing or unavailable: ${task.lang}/${task.name}`)
        finish()
      }
    }

    // Start playback only once the shared AudioContext has resumed, then wait a short leading
    // silence — both steps give real device hardware time to "wake up" before the clip's own
    // first consonant plays, instead of clipping it.
    const afterResume = () => {
      if (settled) return
      leadingSilenceTimer = setTimeout(() => {
        if (leadingSilenceTimer !== null) pendingTimers.delete(leadingSilenceTimer)
        leadingSilenceTimer = null
        startPlayback()
      }, LEADING_SILENCE_MS)
      pendingTimers.add(leadingSilenceTimer)
    }
    const audioContext = getAudioContext()
    if (audioContext?.state === 'suspended') {
      void audioContext.resume().catch(() => { /* Audio may be blocked until another gesture. */ }).then(afterResume)
    } else {
      afterResume()
    }
  })
}

function speakFallback(text: string | undefined, lang: 'en' | 'kn', token: number): Promise<void> {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window) || token !== generation) return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    let cancelGapTimer: TimerHandle | null = null
    const finish = () => {
      if (settled) return
      settled = true
      if (cancelGapTimer !== null) {
        clearTimeout(cancelGapTimer)
        pendingTimers.delete(cancelGapTimer)
        cancelGapTimer = null
      }
      if (currentPlayback?.cancel === cancel) currentPlayback = null
      resolve()
    }
    const cancel = () => {
      cancelSpeechSynthesis()
      finish()
    }
    currentPlayback = { cancel }

    const speak = () => {
      if (settled || token !== generation) return
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang === 'kn' ? 'kn-IN' : 'en-IN'
      utterance.rate = 0.95
      utterance.pitch = 1.0
      const voice = pickVoice(lang)
      if (voice) utterance.voice = voice
      utterance.onend = finish
      utterance.onerror = finish
      try { window.speechSynthesis.speak(utterance) } catch { finish() }
    }

    // Never cancel() then speak() in the same tick — wait out whatever's left of the gap first.
    const elapsedSinceCancel = Date.now() - lastSpeechCancelAt
    if (elapsedSinceCancel < SPEECH_CANCEL_GAP_MS) {
      cancelGapTimer = setTimeout(() => {
        if (cancelGapTimer !== null) pendingTimers.delete(cancelGapTimer)
        cancelGapTimer = null
        speak()
      }, SPEECH_CANCEL_GAP_MS - elapsedSinceCancel)
      pendingTimers.add(cancelGapTimer)
    } else {
      speak()
    }
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
  currentAudioElement = null
  cancelSpeechSynthesis()
  for (const timer of pendingTimers) clearTimeout(timer)
  pendingTimers.clear()
  stopSonify()
  for (const node of activeAudioNodes) {
    try { node.disconnect() } catch { /* A node can already be disconnected. */ }
  }
  activeAudioNodes.clear()
  try { if (typeof navigator !== 'undefined') navigator.vibrate?.(0) } catch { /* Vibration may be unsupported. */ }
}

/** Like stopAll(), but if the clip currently playing has less than `thresholdMs` left, lets it
 * finish naturally instead of cutting it off — calling stopAll() right before every new clip,
 * even when the previous one was almost done anyway, was producing a choppy stop-start overlap
 * when parts were placed quickly in succession. The next clip still queues behind it as normal. */
export function stopAllUnlessAlmostDone(thresholdMs = 150): void {
  const el = currentAudioElement
  if (el && !el.paused && Number.isFinite(el.duration) && el.duration > 0) {
    const remainingMs = (el.duration - el.currentTime) * 1000
    if (remainingMs > 0 && remainingMs < thresholdMs) return
  }
  stopAll()
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
      clearTimeout(sonifyTimer)
      pendingTimers.delete(sonifyTimer)
    }
    sonifyTimer = setTimeout(() => {
      if (sonifyTimer !== null) pendingTimers.delete(sonifyTimer)
      sonifyTimer = null
      stopSonify()
    }, 1500)
    pendingTimers.add(sonifyTimer)
  } catch { stopSonify() }
}

/** Stops and disconnects the continuous circuit tone. */
export function stopSonify(): void {
  if (sonifyTimer !== null) {
    clearTimeout(sonifyTimer)
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
