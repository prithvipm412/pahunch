import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  enqueue,
  queueSize,
  drainQueue,
  resetSessionRateLimit,
} from './offlineQueue'
import { scanCircuit, ERROR_MESSAGES } from './scanApi'
import { hashBase64, getCachedScan, setCachedScan, clearScanCache } from './scanCache'
import drawI18n from '../../content/i18n/draw.json'
import learnI18n from '../../content/i18n/learn.json'
import type { ComponentType, Netlist } from '../contracts/netlist'
import { solve } from '../physics'
import sample1Json from './samples/sample1.json'
import sample2Json from './samples/sample2.json'
import sample3Json from './samples/sample3.json'
import {
  stripDataUrlPrefix,
  normalizeAndValidateMimeType,
  isPayloadTooLarge,
  validateNetlist,
  extractJsonFromText,
  extractRetryDelaySeconds,
  DEMO_NETLIST,
  default as scanHandler,
} from '../../api/scan.ts'

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

describe('Pre-baked sample circuits (offline, zero-API)', () => {
  it('sample1 (2 bulbs in series) solves cleanly without errors', () => {
    const netlist = sample1Json as Netlist
    expect(netlist.gridSize).toBe(5)
    expect(netlist.source).toBe('draw')
    const result = solve(netlist)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.components.find((c) => c.id === 'bulb1')?.state).not.toBe('off')
    expect(result.components.find((c) => c.id === 'bulb2')?.state).not.toBe('off')
  })

  it('sample2 (2 bulbs in parallel) solves cleanly without errors', () => {
    const netlist = sample2Json as Netlist
    expect(netlist.gridSize).toBe(5)
    expect(netlist.source).toBe('draw')
    const result = solve(netlist)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.components.find((c) => c.id === 'bulb1')?.state).not.toBe('off')
    expect(result.components.find((c) => c.id === 'bulb2')?.state).not.toBe('off')
  })

  it('sample3 (bulb + resistor) solves cleanly without errors', () => {
    const netlist = sample3Json as Netlist
    expect(netlist.gridSize).toBe(5)
    expect(netlist.source).toBe('draw')
    const result = solve(netlist)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    const bulb = result.components.find((c) => c.id === 'bulb1')
    expect(bulb?.state).not.toBe('off')
  })
})

describe('Scan Cache (localStorage keyed by image hash)', () => {
  beforeEach(() => {
    clearScanCache()
  })

  it('hashBase64 produces deterministic hashes', () => {
    const h1 = hashBase64('image-data-abc')
    const h2 = hashBase64('image-data-abc')
    const h3 = hashBase64('image-data-xyz')
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
  })

  it('stores and retrieves scan results', () => {
    const hash = hashBase64('base64-payload-1')
    expect(getCachedScan(hash)).toBeNull()

    const netlist: Netlist = { gridSize: 5, source: 'draw', components: [] }
    setCachedScan(hash, { netlist, confidence: 0.95, isDemo: false })

    const cached = getCachedScan(hash)
    expect(cached).not.toBeNull()
    expect(cached?.hash).toBe(hash)
    expect(cached?.netlist).toEqual(netlist)
    expect(cached?.confidence).toBe(0.95)
  })

  it('caps cache at 10 items, dropping oldest on 11th', () => {
    for (let i = 1; i <= 12; i++) {
      const hash = hashBase64(`img-${i}`)
      setCachedScan(hash, {
        netlist: { gridSize: 5, source: 'draw', components: [] },
        confidence: 1.0,
        isDemo: false,
      })
    }
    // Items 1 and 2 should have been evicted
    expect(getCachedScan(hashBase64('img-1'))).toBeNull()
    expect(getCachedScan(hashBase64('img-2'))).toBeNull()
    // Items 3..12 should remain
    expect(getCachedScan(hashBase64('img-3'))).not.toBeNull()
    expect(getCachedScan(hashBase64('img-12'))).not.toBeNull()
  })
})

describe('Draw mode offline queue with dedupe and throttling', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSessionRateLimit()
  })

  it('caps queue at 3 entries, dropping oldest', () => {
    expect(queueSize()).toBe(0)
    enqueue('img1')
    enqueue('img2')
    enqueue('img3')
    expect(queueSize()).toBe(3)

    // 4th entry drops oldest (img1)
    enqueue('img4')
    expect(queueSize()).toBe(3)
  })

  it('dedupes identical images using base64 hash', () => {
    enqueue('identical-data')
    expect(queueSize()).toBe(1)
    enqueue('identical-data')
    expect(queueSize()).toBe(1)

    enqueue('different-data')
    expect(queueSize()).toBe(2)
  })

  it('replays items reporting progress "Sending saved circuit X of N"', async () => {
    enqueue('itemA')
    enqueue('itemB')

    const progressLog: Array<{ current: number; total: number }> = []

    const sent = await drainQueue(
      async () => ({ ok: true, rateLimited: false }),
      (p) => progressLog.push(p),
      1, // 1ms delay for tests
    )

    expect(sent).toBe(2)
    expect(queueSize()).toBe(0)
    expect(progressLog).toEqual([
      { current: 1, total: 2 },
      { current: 2, total: 2 },
    ])
  })

  it('stops replaying immediately when a 429 rate limit is encountered', async () => {
    enqueue('item1')
    enqueue('item2')
    enqueue('item3')

    const sent = await drainQueue(
      async (b64) => {
        if (b64 === 'item1') {
          // rate limit hit on first item
          return { ok: false, rateLimited: true }
        }
        return { ok: true, rateLimited: false }
      },
      undefined,
      1,
    )

    // Stop replaying immediately: 0 sent, all 3 retained in queue
    expect(sent).toBe(0)
    expect(queueSize()).toBe(3)

    // Subsequent drains in this session should be stopped
    const retrySent = await drainQueue(async () => ({ ok: true, rateLimited: false }), undefined, 1)
    expect(retrySent).toBe(0)
  })
})

describe('Draw mode friendly error mapping and 429 countdown', () => {
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

  it('maps 429 rate limit to friendly wait message with retryAfterSeconds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '25' }),
      json: async () => ({ error: 'Quota exceeded for model', retryAfterSeconds: 25 }),
    } as Response)

    const result = await scanCircuit('fake-base64')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('rate_limit')
      expect(result.retryAfterSeconds).toBe(25)
      expect(result.message).toBe('Busy, try again in 25s')
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

describe('api/scan retryDelay extraction', () => {
  it('extracts numeric retryDelay', () => {
    expect(extractRetryDelaySeconds({ retryDelay: 24 })).toBe(24)
    expect(extractRetryDelaySeconds({ retryDelay: 15.2 })).toBe(16)
  })

  it('extracts string retryDelay', () => {
    expect(extractRetryDelaySeconds({ retryDelay: '30s' })).toBe(30)
  })

  it('extracts retryDelay from Google RPC details', () => {
    const err = {
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.RetryInfo',
          retryDelay: '18s',
        },
      ],
    }
    expect(extractRetryDelaySeconds(err)).toBe(18)
  })

  it('extracts retry delay from error message regex', () => {
    expect(extractRetryDelaySeconds(new Error('Resource exhausted, retry after 22s'))).toBe(22)
    expect(extractRetryDelaySeconds(new Error('Quota exceeded. retryDelay: "28s"'))).toBe(28)
  })

  it('returns undefined when no delay is present', () => {
    expect(extractRetryDelaySeconds(new Error('Generic failure'))).toBeUndefined()
  })
})

describe('api/scan prefix stripping', () => {
  it('strips jpeg data URL prefix', () => {
    expect(stripDataUrlPrefix('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe('/9j/4AAQSkZJRg==')
  })

  it('strips png and webp data URL prefixes', () => {
    expect(stripDataUrlPrefix('data:image/png;base64,iVBORw0KGgo=')).toBe('iVBORw0KGgo=')
    expect(stripDataUrlPrefix('data:image/webp;base64,UklGRm==')).toBe('UklGRm==')
  })

  it('strips arbitrary MIME data URL prefixes', () => {
    expect(stripDataUrlPrefix('data:application/octet-stream;base64,SGVsbG8=')).toBe('SGVsbG8=')
  })

  it('returns clean base64 string unchanged', () => {
    expect(stripDataUrlPrefix('/9j/4AAQSkZJRg==')).toBe('/9j/4AAQSkZJRg==')
  })

  it('trims leading and trailing whitespace', () => {
    expect(stripDataUrlPrefix('  data:image/jpeg;base64,/9j/4AAQSkZJRg== \n')).toBe('/9j/4AAQSkZJRg==')
  })
})

describe('api/scan mimeType validation', () => {
  it('defaults to image/jpeg when missing or empty', () => {
    expect(normalizeAndValidateMimeType()).toEqual({ ok: true, mimeType: 'image/jpeg' })
    expect(normalizeAndValidateMimeType('')).toEqual({ ok: true, mimeType: 'image/jpeg' })
    expect(normalizeAndValidateMimeType(undefined)).toEqual({ ok: true, mimeType: 'image/jpeg' })
  })

  it('accepts valid mime types: image/jpeg, image/png, image/webp', () => {
    expect(normalizeAndValidateMimeType('image/jpeg')).toEqual({ ok: true, mimeType: 'image/jpeg' })
    expect(normalizeAndValidateMimeType('image/png')).toEqual({ ok: true, mimeType: 'image/png' })
    expect(normalizeAndValidateMimeType('image/webp')).toEqual({ ok: true, mimeType: 'image/webp' })
  })

  it('normalizes image/jpg to image/jpeg and handles uppercase', () => {
    expect(normalizeAndValidateMimeType('image/jpg')).toEqual({ ok: true, mimeType: 'image/jpeg' })
    expect(normalizeAndValidateMimeType('IMAGE/PNG')).toEqual({ ok: true, mimeType: 'image/png' })
    expect(normalizeAndValidateMimeType('  image/webp  ')).toEqual({ ok: true, mimeType: 'image/webp' })
  })

  it('rejects unsupported mime types', () => {
    const res = normalizeAndValidateMimeType('image/gif')
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toContain('Unsupported mimeType')
    }

    expect(normalizeAndValidateMimeType('application/pdf').ok).toBe(false)
    expect(normalizeAndValidateMimeType('text/plain').ok).toBe(false)
  })
})

describe('api/scan payload size checking', () => {
  it('accepts typical compressed image payload', () => {
    const smallPayload = 'A'.repeat(50000) // ~50KB
    expect(isPayloadTooLarge(smallPayload)).toBe(false)
  })

  it('rejects payload exceeding 4MB', () => {
    const fourMbString = 'A'.repeat(4 * 1024 * 1024 + 10)
    expect(isPayloadTooLarge(fourMbString)).toBe(true)
  })
})

describe('api/scan Netlist validation', () => {
  it('accepts a valid Netlist with adjacent components on a 5x5 grid', () => {
    const valid = {
      gridSize: 5,
      source: 'draw',
      confidence: 0.95,
      components: [
        { id: 'bat1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, value: 9 },
        { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
        { id: 'sw1', type: 'switch', from: { row: 0, col: 2 }, to: { row: 1, col: 2 }, closed: true },
        { id: 'w1', type: 'wire', from: { row: 1, col: 2 }, to: { row: 1, col: 1 } },
      ],
    }
    const result = validateNetlist(valid)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.netlist.gridSize).toBe(5)
      expect(result.netlist.source).toBe('draw')
      expect(result.netlist.components.length).toBe(4)
      expect(result.netlist.confidence).toBe(0.95)
    }
  })

  it('normalizes and splits a long straight wire into unit segments with unique IDs', () => {
    // Horizontal wire spanning 3 dots: (0, 0) -> (0, 3)
    const result = validateNetlist({
      components: [
        { id: 'wire_top', type: 'wire', from: { row: 0, col: 0 }, to: { row: 0, col: 3 } },
      ],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.netlist.components.length).toBe(3)
      const [seg0, seg1, seg2] = result.netlist.components
      expect(seg0).toEqual({
        id: 'wire_top',
        type: 'wire',
        from: { row: 0, col: 0 },
        to: { row: 0, col: 1 },
      })
      expect(seg1).toEqual({
        id: 'wire_top_seg_1',
        type: 'wire',
        from: { row: 0, col: 1 },
        to: { row: 0, col: 2 },
      })
      expect(seg2).toEqual({
        id: 'wire_top_seg_2',
        type: 'wire',
        from: { row: 0, col: 2 },
        to: { row: 0, col: 3 },
      })
      const ids = new Set(result.netlist.components.map((c) => c.id))
      expect(ids.size).toBe(3)
    }
  })

  it('normalizes and splits a long vertical wire in reverse direction', () => {
    // Vertical wire spanning 2 dots backwards: (3, 2) -> (1, 2)
    const result = validateNetlist({
      components: [
        { id: 'w_down', type: 'wire', from: { row: 3, col: 2 }, to: { row: 1, col: 2 } },
      ],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.netlist.components.length).toBe(2)
      expect(result.netlist.components[0]).toEqual({
        id: 'w_down',
        type: 'wire',
        from: { row: 3, col: 2 },
        to: { row: 2, col: 2 },
      })
      expect(result.netlist.components[1]).toEqual({
        id: 'w_down_seg_1',
        type: 'wire',
        from: { row: 2, col: 2 },
        to: { row: 1, col: 2 },
      })
    }
  })

  it('keeps battery/bulb/resistor/switch on the first unit segment and fills rest with wires', () => {
    const input = {
      components: [
        {
          id: 'bat1',
          type: 'battery',
          from: { row: 0, col: 0 },
          to: { row: 0, col: 2 },
          value: 9,
        },
        {
          id: 'bulb1',
          type: 'bulb',
          from: { row: 1, col: 4 },
          to: { row: 3, col: 4 },
        },
      ],
    }
    const result = validateNetlist(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.netlist.components.length).toBe(4)

      expect(result.netlist.components[0]).toEqual({
        id: 'bat1',
        type: 'battery',
        from: { row: 0, col: 0 },
        to: { row: 0, col: 1 },
        value: 9,
      })
      expect(result.netlist.components[1]).toEqual({
        id: 'bat1_wire_1',
        type: 'wire',
        from: { row: 0, col: 1 },
        to: { row: 0, col: 2 },
      })

      expect(result.netlist.components[2]).toEqual({
        id: 'bulb1',
        type: 'bulb',
        from: { row: 1, col: 4 },
        to: { row: 2, col: 4 },
      })
      expect(result.netlist.components[3]).toEqual({
        id: 'bulb1_wire_1',
        type: 'wire',
        from: { row: 2, col: 4 },
        to: { row: 3, col: 4 },
      })

      const ids = new Set(result.netlist.components.map((c) => c.id))
      expect(ids.size).toBe(4)
    }
  })

  it('rejects diagonal parts and zero-length parts', () => {
    // Diagonal connection
    const diagResult = validateNetlist({
      components: [{ id: 'w1', type: 'wire', from: { row: 0, col: 0 }, to: { row: 1, col: 1 } }],
    })
    expect(diagResult.ok).toBe(false)
    if (!diagResult.ok) {
      expect(diagResult.error).toContain('diagonal')
    }

    // Same point connection (zero length)
    const sameResult = validateNetlist({
      components: [{ id: 'w1', type: 'wire', from: { row: 2, col: 2 }, to: { row: 2, col: 2 } }],
    })
    expect(sameResult.ok).toBe(false)
    if (!sameResult.ok) {
      expect(sameResult.error).toContain('zero length')
    }
  })

  it('rejects invalid top-level shape or missing components array', () => {
    expect(validateNetlist(null).ok).toBe(false)
    expect(validateNetlist('not a netlist').ok).toBe(false)
    expect(validateNetlist([]).ok).toBe(false)
    expect(validateNetlist({ gridSize: 5 }).ok).toBe(false)
  })

  it('rejects unknown component types', () => {
    const input = {
      components: [
        { id: 'x1', type: 'inductor', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
      ],
    }
    const result = validateNetlist(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('unknown type: inductor')
    }
  })

  it('rejects components with invalid or out-of-bounds coordinates', () => {
    // row out of 0..4
    expect(
      validateNetlist({
        components: [{ id: 'b1', type: 'battery', from: { row: 5, col: 0 }, to: { row: 4, col: 0 } }],
      }).ok,
    ).toBe(false)

    // negative row
    expect(
      validateNetlist({
        components: [{ id: 'b1', type: 'battery', from: { row: -1, col: 0 }, to: { row: 0, col: 0 } }],
      }).ok,
    ).toBe(false)

    // non-integer float row
    expect(
      validateNetlist({
        components: [{ id: 'b1', type: 'battery', from: { row: 1.5, col: 0 }, to: { row: 2.5, col: 0 } }],
      }).ok,
    ).toBe(false)
  })
})

describe('api/scan safe JSON extraction from text', () => {
  it('parses direct JSON string', () => {
    const raw = JSON.stringify({ gridSize: 5, components: [] })
    expect(extractJsonFromText(raw)).toEqual({ gridSize: 5, components: [] })
  })

  it('extracts JSON enclosed in markdown code fences', () => {
    const wrapped = '```json\n{\n  "gridSize": 5,\n  "components": []\n}\n```'
    expect(extractJsonFromText(wrapped)).toEqual({ gridSize: 5, components: [] })
  })

  it('extracts JSON with surrounding conversational prose', () => {
    const text = 'Here is your circuit diagram as requested:\n```json\n{"gridSize": 5, "components": []}\n```\nHope this helps!'
    expect(extractJsonFromText(text)).toEqual({ gridSize: 5, components: [] })
  })

  it('throws on empty or non-JSON text', () => {
    expect(() => extractJsonFromText('')).toThrow()
    expect(() => extractJsonFromText('I could not read the image.')).toThrow()
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

describe('api/scan handler HTTP flow', () => {
  function createMockResponse() {
    const res: {
      statusCode: number
      headers: Record<string, string>
      body: unknown
      status: (code: number) => typeof res
      setHeader: (k: string, v: string) => typeof res
      json: (data: unknown) => typeof res
    } = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code: number) {
        this.statusCode = code
        return this
      },
      setHeader(k: string, v: string) {
        this.headers[k] = v
        return this
      },
      json(data: unknown) {
        this.body = data
        return this
      },
    }
    return res
  }

  it('rejects non-POST requests with 405', async () => {
    const req = { method: 'GET' } as any
    const res = createMockResponse()
    await scanHandler(req, res as any)
    expect(res.statusCode).toBe(405)
  })

  it('returns demo netlist with X-Demo: 1 when GEMINI_API_KEY is unset', async () => {
    const prevKey = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY
    try {
      const req = { method: 'POST', body: { image: 'fake-base64' } } as any
      const res = createMockResponse()
      await scanHandler(req, res as any)
      expect(res.statusCode).toBe(200)
      expect(res.headers['X-Demo']).toBe('1')
      expect(res.body).toEqual(DEMO_NETLIST)
    } finally {
      if (prevKey) process.env.GEMINI_API_KEY = prevKey
    }
  })

  it('rejects missing image with 400', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    try {
      const req = { method: 'POST', body: {} } as any
      const res = createMockResponse()
      await scanHandler(req, res as any)
      expect(res.statusCode).toBe(400)
      expect((res.body as any).error).toContain('Missing image field')
    } finally {
      delete process.env.GEMINI_API_KEY
    }
  })

  it('rejects unsupported mimeType with 400', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    try {
      const req = { method: 'POST', body: { image: 'dGVzdA==', mimeType: 'image/gif' } } as any
      const res = createMockResponse()
      await scanHandler(req, res as any)
      expect(res.statusCode).toBe(400)
      expect((res.body as any).error).toContain('Unsupported mimeType')
    } finally {
      delete process.env.GEMINI_API_KEY
    }
  })

  it('rejects image >4MB with 413', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    try {
      const hugeImage = 'A'.repeat(4 * 1024 * 1024 + 100)
      const req = { method: 'POST', body: { image: hugeImage } } as any
      const res = createMockResponse()
      await scanHandler(req, res as any)
      expect(res.statusCode).toBe(413)
      expect((res.body as any).error).toContain('Image exceeds 4MB limit')
    } finally {
      delete process.env.GEMINI_API_KEY
    }
  })
})
