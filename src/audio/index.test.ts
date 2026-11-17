import { afterEach, describe, expect, it, vi } from 'vitest'
import { playClip, playSequence, stopAll, stopAllUnlessAlmostDone } from './index'

class FakeAudio {
  static instances: FakeAudio[] = []
  currentTime = 0
  duration = NaN
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

  it('waits out the leading-silence delay before calling .play()', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('Audio', FakeAudio)
      const pending = playClip('en', 'first')
      expect(FakeAudio.instances).toHaveLength(1)
      expect(FakeAudio.instances[0].paused).toBe(true) // .play() hasn't fired yet

      await vi.advanceTimersByTimeAsync(100) // past LEADING_SILENCE_MS
      expect(FakeAudio.instances[0].paused).toBe(false) // now it has

      FakeAudio.instances[0].finish()
      await pending
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('stopAllUnlessAlmostDone', () => {
  afterEach(() => {
    stopAll()
    vi.unstubAllGlobals()
    FakeAudio.instances = []
  })

  it('lets an almost-finished clip keep playing instead of cutting it off', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('Audio', FakeAudio)
      const pending = playClip('en', 'first')
      await vi.advanceTimersByTimeAsync(100) // past the leading-silence delay — now actually playing
      const instance = FakeAudio.instances[0]
      instance.duration = 1
      instance.currentTime = 0.96 // 40ms remaining — under the 150ms default threshold

      stopAllUnlessAlmostDone()
      expect(instance.paused).toBe(false) // not interrupted

      instance.finish()
      await pending
    } finally {
      vi.useRealTimers()
    }
  })

  it('interrupts a clip with plenty of time left, same as stopAll()', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('Audio', FakeAudio)
      const pending = playClip('en', 'first')
      await vi.advanceTimersByTimeAsync(100)
      const instance = FakeAudio.instances[0]
      instance.duration = 1
      instance.currentTime = 0.1 // 900ms remaining — well over the threshold

      stopAllUnlessAlmostDone()
      expect(instance.paused).toBe(true) // interrupted

      await pending
    } finally {
      vi.useRealTimers()
    }
  })
})
