import { afterEach, describe, expect, it, vi } from 'vitest'
import { playClip, playSequence, stopAll } from './index'

class FakeAudio {
  static instances: FakeAudio[] = []
  currentTime = 0
  error: MediaError | null = null
  paused = true
  private listeners = new Map<string, Set<() => void>>()

  readonly src: string
  constructor(src: string) { this.src = src; FakeAudio.instances.push(this) }
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = typeof listener === 'function' ? listener as () => void : () => listener.handleEvent(new Event(type))
    const group = this.listeners.get(type) ?? new Set<() => void>()
    group.add(callback)
    this.listeners.set(type, group)
  }
  removeEventListener(type: string, _listener: EventListenerOrEventListenerObject) { this.listeners.delete(type) }
  play() { this.paused = false; return Promise.resolve() }
  pause() { this.paused = true }
  finish() { for (const listener of this.listeners.get('ended') ?? []) listener() }
}

describe('audio playback controller', () => {
  afterEach(() => {
    stopAll()
    vi.unstubAllGlobals()
    FakeAudio.instances = []
  })

  it('cancels a sequence so its next clip cannot start after stopAll', async () => {
    vi.stubGlobal('Audio', FakeAudio)
    const sequence = playSequence('en', ['first', 'stale-next'])

    expect(FakeAudio.instances).toHaveLength(1)
    stopAll()
    await sequence

    expect(FakeAudio.instances).toHaveLength(1)
    expect(FakeAudio.instances[0].paused).toBe(true)
    expect(FakeAudio.instances[0].currentTime).toBe(0)
  })

  it('plays queued clips one at a time', async () => {
    vi.stubGlobal('Audio', FakeAudio)
    const first = playClip('en', 'first')
    const second = playClip('kn', 'second')

    expect(FakeAudio.instances).toHaveLength(1)
    FakeAudio.instances[0].finish()
    await first
    await Promise.resolve()
    expect(FakeAudio.instances).toHaveLength(2)
    expect(FakeAudio.instances[1].src).toContain('/audio/kn/second.mp3')
    stopAll()
    await second
  })
})
