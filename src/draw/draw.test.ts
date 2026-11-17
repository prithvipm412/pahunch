import { describe, it, expect, beforeEach } from 'vitest'
import { enqueue, queueSize, drainQueue } from './offlineQueue'
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

describe('i18n translations consistency', () => {
  it('draw.json has identical keys for en and kn', () => {
    const enKeys = Object.keys(drawI18n.en).sort()
    const knKeys = Object.keys(drawI18n.kn).sort()
    expect(enKeys).toEqual(knKeys)
  })

  it('learn.json has identical keys for en and kn', () => {
    const enKeys = Object.keys(learnI18n.en).sort()
    const knKeys = Object.keys(learnI18n.kn).sort()
    expect(enKeys).toEqual(knKeys)
  })
})
