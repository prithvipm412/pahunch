import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { enqueue, queueSize, drainQueue } from './offlineQueue'
import { scanCircuit, ERROR_MESSAGES } from './scanApi'
import drawI18n from '../../content/i18n/draw.json'
import learnI18n from '../../content/i18n/learn.json'
import type { ComponentType } from '../contracts/netlist'

// In-memory mock for localStorage in Node/Vitest environment
const store: Record<string, string> = {}
const mockStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => {
    store[key] = val
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k]
  },
}
// @ts-expect-error polyfill for node test environment
globalThis.localStorage = mockStorage

const COMPONENT_CYCLE: ComponentType[] = ['battery', 'bulb', 'resistor', 'switch', 'wire']

function getNextType(current: ComponentType): ComponentType {
  const idx = COMPONENT_CYCLE.indexOf(current)
  return COMPONENT_CYCLE[(idx + 1) % COMPONENT_CYCLE.length]
}

describe('Draw mode tap-to-fix type cycling', () => {
  it('cycles through battery -> bulb -> resistor -> switch -> wire -> battery', () => {
    expect(getNextType('battery')).toBe('bulb')
    expect(getNextType('bulb')).toBe('resistor')
    expect(getNextType('resistor')).toBe('switch')
    expect(getNextType('switch')).toBe('wire')
    expect(getNextType('wire')).toBe('battery')
  })
})

describe('Draw mode offline queue', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('queues images up to a maximum of 5 entries', () => {
    expect(queueSize()).toBe(0)
    enqueue('img1')
    enqueue('img2')
    enqueue('img3')
    enqueue('img4')
    enqueue('img5')
    expect(queueSize()).toBe(5)

    // 6th entry drops oldest
    enqueue('img6')
    expect(queueSize()).toBe(5)
  })

  it('drains successfully sent items from the queue', async () => {
    enqueue('img1')
    enqueue('img2')
    enqueue('img3')

    const sent = await drainQueue(async (base64) => {
      // simulate success for all except img2
      return base64 !== 'img2'
    })

    expect(sent).toBe(2)
    expect(queueSize()).toBe(1)
  })
})

describe('Draw mode friendly error mapping', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('maps network failures to friendly offline message', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
    const result = await scanCircuit('fake-base64')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('network')
      expect(result.message).toBe(ERROR_MESSAGES.network)
      expect(result.message).not.toContain('Failed to fetch')
    }
  })

  it('maps 429 rate limit to friendly wait message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Quota exceeded for model' }),
    } as Response)

    const result = await scanCircuit('fake-base64')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('rate_limit')
      expect(result.message).toBe(ERROR_MESSAGES.rateLimit)
      expect(result.message).toBe('Too many scans, wait a minute and try again.')
      expect(result.message).not.toContain('Quota exceeded')
    }
  })

  it('maps 500 server error to friendly retry/sample message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Model Failure: bad json syntax' }),
    } as Response)

    const result = await scanCircuit('fake-base64')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('server')
      expect(result.message).toBe(ERROR_MESSAGES.server)
      expect(result.message).toBe("Couldn't read the circuit right now. Try a sample drawing or Build mode.")
      expect(result.message).not.toContain('bad json syntax')
    }
  })
})

describe('i18n translations consistency', () => {
  it('draw.json has identical keys for en and kn', () => {
    const enKeys = Object.keys(drawI18n.en).sort()
    const knKeys = Object.keys(drawI18n.kn).sort()
    expect(enKeys).toEqual(knKeys)
  })

  it('draw.json contains server_error and rate_limit_error', () => {
    expect(drawI18n.en.server_error).toBe(
      "Couldn't read the circuit right now. Try a sample drawing or Build mode.",
    )
    expect(drawI18n.en.rate_limit_error).toBe('Too many scans, wait a minute and try again.')
    expect(drawI18n.kn.server_error).toBeDefined()
    expect(drawI18n.kn.rate_limit_error).toBeDefined()
  })

  it('learn.json has identical keys for en and kn', () => {
    const enKeys = Object.keys(learnI18n.en).sort()
    const knKeys = Object.keys(learnI18n.kn).sort()
    expect(enKeys).toEqual(knKeys)
  })
})
