import type { SolveResult } from '../contracts/netlist'

const activeAudio = new Set<HTMLAudioElement>()
let context: AudioContext | null = null
let oscillator: OscillatorNode | null = null
let gain: GainNode | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioContextConstructor = window.AudioContext
  if (!AudioContextConstructor) return null
  context ??= new AudioContextConstructor()
  return context
}

/** Creates and resumes the shared audio context after a user gesture. */
export async function unlockAudio(): Promise<void> {
  try {
    const audioContext = getAudioContext()
    if (audioContext?.state === 'suspended') await audioContext.resume()
  } catch { /* Audio can remain unavailable when the browser blocks it. */ }
}

/** Plays a named language clip, with optional spoken fallback text. */
export async function playClip(lang: 'en' | 'kn', name: string, fallbackText?: string): Promise<void> {
  stopClipPlayers()
  const audio = new Audio(`/audio/${lang}/${encodeURIComponent(name)}.mp3`)
  activeAudio.add(audio)
  try {
    await audio.play()
    const played = await new Promise<boolean>((resolve) => { audio.addEventListener('ended', () => resolve(true), { once: true }); audio.addEventListener('error', () => resolve(false), { once: true }) })
    if (!played) speakFallback(fallbackText)
  } catch {
    speakFallback(fallbackText)
  } finally { activeAudio.delete(audio) }
}

function speakFallback(text?: string) {
  if (text && typeof window !== 'undefined' && 'speechSynthesis' in window) { const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en'; window.speechSynthesis.speak(utterance) }
}

/** Plays clips sequentially, waiting for each clip to finish. */
export async function playSequence(lang: 'en' | 'kn', names: string[]): Promise<void> {
  for (const name of names) await playClip(lang, name)
}

/** Stops clips, speech, and the active sonification tone. */
export function stopAll(): void {
  stopClipPlayers()
  stopSonify()
}

function stopClipPlayers() {
  for (const audio of activeAudio) { audio.pause(); audio.currentTime = 0 }
  activeAudio.clear()
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}

/** Starts a continuous tone shaped by total bulb power and circuit current. */
export function sonify(result: SolveResult): void {
  // SolveResult omits component types, so use the reported component power total as a proxy.
  const totalPower = result.components.reduce((sum, component) => sum + Math.max(0, component.power), 0)
  const totalCurrent = result.components.reduce((sum, component) => sum + Math.abs(component.current), 0)
  try {
    const audioContext = getAudioContext()
    if (!audioContext) return
    if (!oscillator || !gain) {
      oscillator = audioContext.createOscillator()
      gain = audioContext.createGain()
      oscillator.type = 'sine'
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start()
    }
    const now = audioContext.currentTime
    oscillator.frequency.setTargetAtTime(180 + Math.min(totalCurrent, 3) * 180, now, 0.12)
    gain.gain.setTargetAtTime(Math.min(0.16, 0.018 + Math.sqrt(totalPower) * 0.025), now, 0.16)
    if (audioContext.state === 'suspended') void audioContext.resume()
  } catch { stopSonify() }
}

/** Stops the continuous circuit tone. */
export function stopSonify(): void {
  if (context && gain) gain.gain.setTargetAtTime(0, context.currentTime, 0.08)
  oscillator?.stop()
  oscillator?.disconnect()
  gain?.disconnect()
  oscillator = null
  gain = null
}

/** Vibrates when the browser supports device vibration. */
export function vibrate(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern) } catch { /* Unsupported or blocked by the browser. */ }
}
