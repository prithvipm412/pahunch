import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI, Type } from '@google/genai'
import type { Netlist, CircuitComponent, ComponentType, GridPoint } from '../src/contracts/netlist.ts'

export interface ScanApiResponse extends Netlist {
  confidence?: number
}

// Demo netlist returned when no API key is set (2 bulbs in series with a battery)
export const DEMO_NETLIST: ScanApiResponse = {
  gridSize: 5,
  source: 'draw',
  confidence: 1.0,
  components: [
    { id: 'bat1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, value: 9 },
    { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
    { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
    { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
  ],
}

// Response schema matching the Netlist type with confidence for structured JSON output
export const NETLIST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    gridSize: { type: Type.NUMBER },
    source: { type: Type.STRING },
    confidence: {
      type: Type.NUMBER,
      description: 'Confidence score from 0.0 to 1.0 on how clearly and unambiguously the circuit was read',
    },
    components: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: {
            type: Type.STRING,
            enum: ['battery', 'bulb', 'resistor', 'switch', 'wire'],
          },
          from: {
            type: Type.OBJECT,
            properties: {
              row: { type: Type.NUMBER },
              col: { type: Type.NUMBER },
            },
            required: ['row', 'col'],
          },
          to: {
            type: Type.OBJECT,
            properties: {
              row: { type: Type.NUMBER },
              col: { type: Type.NUMBER },
            },
            required: ['row', 'col'],
          },
          value: { type: Type.NUMBER },
          closed: { type: Type.BOOLEAN },
        },
        required: ['id', 'type', 'from', 'to'],
      },
    },
  },
  required: ['gridSize', 'source', 'confidence', 'components'],
}

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

export const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024 // 4 MB

export const BATTERY_PRESETS = [1.5, 3, 4.5, 6, 9] as const
export const RESISTOR_PRESETS = [5, 10, 20, 50, 100] as const
export const DEFAULT_BATTERY_VOLTAGE = 3
export const DEFAULT_RESISTOR_OHMS = 10

/** Snaps a numeric value to the nearest preset in a list of numbers */
export function snapToPreset(val: number, presets: readonly number[]): number {
  let closest = presets[0]
  let minDiff = Math.abs(val - closest)
  for (let i = 1; i < presets.length; i++) {
    const diff = Math.abs(val - presets[i])
    if (diff < minDiff) {
      minDiff = diff
      closest = presets[i]
    }
  }
  return closest
}

/** Defensively strips data URL scheme prefix (e.g. "data:image/jpeg;base64,") */
export function stripDataUrlPrefix(image: string): string {
  return image.trim().replace(/^data:[^;]+;base64,/i, '').trim()
}

/** Validates and normalizes MIME type, defaulting to image/jpeg */
export function normalizeAndValidateMimeType(
  rawMime?: unknown,
): { ok: true; mimeType: AllowedMimeType } | { ok: false; error: string } {
  const mime = (typeof rawMime === 'string' && rawMime.trim().toLowerCase()) || 'image/jpeg'
  const normalized = mime === 'image/jpg' ? 'image/jpeg' : mime
  if (normalized !== 'image/jpeg' && normalized !== 'image/png' && normalized !== 'image/webp') {
    return {
      ok: false,
      error: `Unsupported mimeType "${rawMime}". Allowed: image/jpeg, image/png, image/webp`,
    }
  }
  return { ok: true, mimeType: normalized as AllowedMimeType }
}

/** Rejects payload exceeding 4MB */
export function isPayloadTooLarge(cleanBase64: string): boolean {
  const decodedBytes = Math.ceil((cleanBase64.length * 3) / 4)
  return cleanBase64.length > MAX_PAYLOAD_BYTES || decodedBytes > MAX_PAYLOAD_BYTES
}

const KNOWN_COMPONENT_TYPES = new Set<ComponentType>([
  'battery',
  'bulb',
  'resistor',
  'switch',
  'wire',
])

function isValidGridPoint(pt: unknown): pt is GridPoint {
  if (!pt || typeof pt !== 'object') return false
  const p = pt as Record<string, unknown>
  return (
    typeof p.row === 'number' &&
    Number.isInteger(p.row) &&
    p.row >= 0 &&
    p.row <= 4 &&
    typeof p.col === 'number' &&
    Number.isInteger(p.col) &&
    p.col >= 0 &&
    p.col <= 4
  )
}

/**
 * Validates and normalizes parsed JSON to match the Netlist shape:
 * - components array
 * - every component has known type, id, row/col integers 0..4
 * - straight horizontal/vertical parts spanning >1 dot are split into unit segments:
 *   • a long straight WIRE splits into unit wire segments
 *   • a long straight battery/bulb/resistor/switch keeps the component on the first unit segment,
 *     and fills the rest with unit wire segments
 *   • split segments receive unique IDs
 * - rejects diagonal parts, zero-length parts, or out-of-range coordinates
 */
export function validateNetlist(
  data: unknown,
): { ok: true; netlist: ScanApiResponse } | { ok: false; error: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Parsed netlist is not an object' }
  }

  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.components)) {
    return { ok: false, error: 'Missing components array' }
  }

  const validatedComponents: CircuitComponent[] = []
  const usedIds = new Set<string>()

  // Pre-seed used IDs from input
  for (const item of obj.components) {
    if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string') {
      const idStr = ((item as Record<string, unknown>).id as string).trim()
      if (idStr) usedIds.add(idStr)
    }
  }

  function getUniqueId(baseId: string): string {
    let candidate = baseId
    let counter = 1
    while (usedIds.has(candidate)) {
      candidate = `${baseId}_${counter++}`
    }
    usedIds.add(candidate)
    return candidate
  }

  function sanitizeComponentValues(comp: CircuitComponent, raw: Record<string, unknown>) {
    if (comp.type === 'battery') {
      comp.value =
        typeof raw.value === 'number' && !isNaN(raw.value) && raw.value > 0
          ? snapToPreset(raw.value, BATTERY_PRESETS)
          : DEFAULT_BATTERY_VOLTAGE
    } else if (comp.type === 'resistor') {
      comp.value =
        typeof raw.value === 'number' && !isNaN(raw.value) && raw.value > 0
          ? snapToPreset(raw.value, RESISTOR_PRESETS)
          : DEFAULT_RESISTOR_OHMS
    } else if (comp.type === 'switch') {
      comp.closed = typeof raw.closed === 'boolean' ? raw.closed : true
    }
  }

  for (let i = 0; i < obj.components.length; i++) {
    const raw = obj.components[i]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: `Component at index ${i} is not an object` }
    }
    const c = raw as Record<string, unknown>

    if (typeof c.id !== 'string' || !c.id.trim()) {
      return { ok: false, error: `Component at index ${i} missing valid string id` }
    }

    if (typeof c.type !== 'string' || !KNOWN_COMPONENT_TYPES.has(c.type as ComponentType)) {
      return { ok: false, error: `Component ${c.id} has unknown type: ${String(c.type)}` }
    }

    if (!isValidGridPoint(c.from)) {
      return { ok: false, error: `Component ${c.id} has invalid or out-of-range from point` }
    }

    if (!isValidGridPoint(c.to)) {
      return { ok: false, error: `Component ${c.id} has invalid or out-of-range to point` }
    }

    const rowDiff = c.to.row - c.from.row
    const colDiff = c.to.col - c.from.col
    const absRowDiff = Math.abs(rowDiff)
    const absColDiff = Math.abs(colDiff)

    // Reject zero-length parts
    if (absRowDiff === 0 && absColDiff === 0) {
      return {
        ok: false,
        error: `Component ${c.id} has zero length (from and to are the same point)`,
      }
    }

    // Only reject diagonal parts: straight horizontal or straight vertical are allowed
    if (absRowDiff > 0 && absColDiff > 0) {
      return {
        ok: false,
        error: `Component ${c.id} is diagonal from (${c.from.row},${c.from.col}) to (${c.to.row},${c.to.col})`,
      }
    }

    const steps = Math.max(absRowDiff, absColDiff)
    const stepRow = absRowDiff === 0 ? 0 : Math.sign(rowDiff)
    const stepCol = absColDiff === 0 ? 0 : Math.sign(colDiff)
    const rawId = c.id.trim()

    if (steps === 1) {
      // Already a unit segment
      const comp: CircuitComponent = {
        id: rawId,
        type: c.type as ComponentType,
        from: { row: c.from.row, col: c.from.col },
        to: { row: c.to.row, col: c.to.col },
      }
      sanitizeComponentValues(comp, c)
      validatedComponents.push(comp)
    } else {
      // Multi-dot span: split into unit segments
      if (c.type === 'wire') {
        for (let k = 0; k < steps; k++) {
          const segFrom: GridPoint = {
            row: c.from.row + k * stepRow,
            col: c.from.col + k * stepCol,
          }
          const segTo: GridPoint = {
            row: c.from.row + (k + 1) * stepRow,
            col: c.from.col + (k + 1) * stepCol,
          }
          const segId = k === 0 ? rawId : getUniqueId(`${rawId}_seg_${k}`)
          validatedComponents.push({
            id: segId,
            type: 'wire',
            from: segFrom,
            to: segTo,
          })
        }
      } else {
        // Battery / bulb / resistor / switch: keep component on first unit segment, fill rest with wires
        for (let k = 0; k < steps; k++) {
          const segFrom: GridPoint = {
            row: c.from.row + k * stepRow,
            col: c.from.col + k * stepCol,
          }
          const segTo: GridPoint = {
            row: c.from.row + (k + 1) * stepRow,
            col: c.from.col + (k + 1) * stepCol,
          }

          if (k === 0) {
            const comp: CircuitComponent = {
              id: rawId,
              type: c.type as ComponentType,
              from: segFrom,
              to: segTo,
            }
            sanitizeComponentValues(comp, c)
            validatedComponents.push(comp)
          } else {
            const wireId = getUniqueId(`${rawId}_wire_${k}`)
            validatedComponents.push({
              id: wireId,
              type: 'wire',
              from: segFrom,
              to: segTo,
            })
          }
        }
      }
    }
  }

  const confidence =
    typeof obj.confidence === 'number' && !isNaN(obj.confidence)
      ? Math.max(0, Math.min(1, obj.confidence))
      : 0.9

  const netlist: ScanApiResponse = {
    gridSize: 5,
    source: 'draw',
    confidence,
    components: validatedComponents,
  }

  return { ok: true, netlist }
}

/** Extracts JSON from text, safely stripping markdown code fences or surrounding prose */
export function extractJsonFromText(rawText?: string | null): unknown {
  if (!rawText || !rawText.trim()) {
    throw new Error('Empty response from model')
  }

  let cleaned = rawText.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  } else {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1)
    }
  }

  return JSON.parse(cleaned)
}

function buildPrompt(hint?: string): string {
  const base = `You are an expert circuit-reading assistant for a school DC electricity learning app.

Read the hand-drawn DC circuit in this image using standard circuit schematic symbols:

### FEW-SHOT SYMBOL DESCRIPTIONS:
1. Battery (DC voltage source):
   - Drawn as two or more parallel lines perpendicular to the wire: a long thin positive line and a shorter thicker negative line, or stacked cell pairs with + / - markings.
   - Read written voltage labels (e.g., '1.5V', '2V', '3V', '5V', '6V', '9V') into the 'value' field. Snap to nearest preset: 1.5, 3, 4.5, 6, 9 V. Default is 3 V if unlabelled.
   - Example component: { "id": "bat1", "type": "battery", "from": {"row": 0, "col": 0}, "to": {"row": 0, "col": 1}, "value": 3 }

2. Bulb / Lamp (resistive load that glows):
   - Drawn as a circle with an 'X' inside, a circle with a filament loop inside, or a coil/loop symbol labelled "bulb" or "lamp".
   - Example component: { "id": "bulb1", "type": "bulb", "from": {"row": 0, "col": 1}, "to": {"row": 0, "col": 2} }

3. Resistor (current limiter):
   - Drawn as a zigzag line (sharp peaks and valleys) or a clean rectangle along the wire.
   - Read written resistance labels (e.g., '5Ω', '10Ω', '20Ω', '50Ω', '100Ω', '10 ohm') into the 'value' field. Snap to nearest preset: 5, 10, 20, 50, 100 Ω. Default is 10 Ω if unlabelled.
   - Example component: { "id": "res1", "type": "resistor", "from": {"row": 1, "col": 2}, "to": {"row": 1, "col": 3}, "value": 10 }

4. Switch (circuit breaker / controller):
   - Drawn as a gap in the wire with an angled lever/blade, or a gap in a line. Default closed = true unless it is clearly drawn open (angled lever away from contact).
   - Example component: { "id": "sw1", "type": "switch", "from": {"row": 0, "col": 2}, "to": {"row": 0, "col": 3}, "closed": true }

5. Wire (conductive path):
   - Drawn as plain straight lines connecting components or turning 90-degree corners.
   - Only output wires for lines actually drawn. A simple rectangle loop has NO wires inside it. Do not invent connections. Most student drawings are ONE series loop.
   - Example component: { "id": "wire1", "type": "wire", "from": {"row": 0, "col": 3}, "to": {"row": 1, "col": 3} }

### CRITICAL JUNCTION & TOPOLOGY RULES:
- 5×5 Grid: Map all components onto a 5×5 grid (rows 0–4, cols 0–4). Preserving which parts connect to which.
- Adjacent endpoints: Each component's 'from' and 'to' must be directly adjacent orthogonal points (step of 1 horizontally or vertically).
- Junctions: Two components connect ONLY if they share the exact same grid point { row, col }.
- Crossing lines without a dot do NOT connect: If two lines cross without a clear junction dot, they bridge over each other and do NOT share a grid point.
- Closed loop: If a closed loop is drawn, ALWAYS return an unbroken closed loop of components and wires so the circuit path is electrically complete. Never leave accidental gaps or open ends if the drawing was intended as a closed circuit.
- Do NOT invent components or phantom wires: Only output wires for lines actually drawn. A simple rectangle loop has NO wires inside it. Do not invent connections. Most student drawings are ONE series loop.
- Confidence score (0.0 to 1.0):
  - 0.85 - 1.0: Crystal clear drawing, unambiguous symbols, fully closed loop.
  - 0.60 - 0.84: Readable drawing with minor handwriting noise, slight tilt, or lightly drawn lines.
  - Below 0.60: Faint, blurry, ambiguous symbols, incomplete paths, or uncertain component types.

Set gridSize to 5, source to "draw", and return valid JSON with "components" and "confidence".`

  if (hint) {
    return `${base}

IMPORTANT — the previous reading had this validation error: "${hint}"
Re-examine the image carefully with this error in mind and correct the netlist.`
  }
  return base
}

export function isSchemaUnsupportedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /response[_-]?schema|response[_-]?mime[_-]?type|unsupported/i.test(msg)
}

export function is429(err: unknown): boolean {
  if (!err) return false
  const status =
    (err as { status?: number; statusCode?: number }).status ??
    (err as { statusCode?: number }).statusCode
  if (status === 429) return true
  const msg = err instanceof Error ? err.message : String(err)
  return /429|resource_exhausted|quota/i.test(msg)
}

export function is5xx(err: unknown): boolean {
  if (!err) return false
  const status =
    (err as { status?: number; statusCode?: number }).status ??
    (err as { statusCode?: number }).statusCode
  if (typeof status === 'number' && status >= 500 && status < 600) return true
  const msg = err instanceof Error ? err.message : String(err)
  return /500|502|503|504|internal|unavailable|overloaded/i.test(msg)
}

/** Extracts retry delay in seconds from error details or error message */
export function extractRetryDelaySeconds(err: unknown): number | undefined {
  if (!err) return undefined
  const e = err as Record<string, unknown>

  if (typeof e.retryDelay === 'number' && e.retryDelay > 0) {
    return Math.ceil(e.retryDelay)
  }
  if (typeof e.retryDelay === 'string') {
    const m = e.retryDelay.match(/(\d+(?:\.\d+)?)/)
    if (m) return Math.ceil(parseFloat(m[1]))
  }

  const details = e.errorDetails ?? e.details ?? (e.error as Record<string, unknown> | undefined)?.details
  if (Array.isArray(details)) {
    for (const d of details) {
      if (d && typeof d === 'object') {
        const item = d as Record<string, unknown>
        if (
          (typeof item['@type'] === 'string' && item['@type'].includes('RetryInfo')) ||
          item.retryDelay
        ) {
          if (typeof item.retryDelay === 'number' && item.retryDelay > 0) {
            return Math.ceil(item.retryDelay)
          }
          if (typeof item.retryDelay === 'string') {
            const m = item.retryDelay.match(/(\d+(?:\.\d+)?)/)
            if (m) return Math.ceil(parseFloat(m[1]))
          }
          if (
            item.retryDelay &&
            typeof item.retryDelay === 'object' &&
            typeof (item.retryDelay as Record<string, unknown>).seconds === 'number'
          ) {
            return Math.ceil((item.retryDelay as Record<string, unknown>).seconds as number)
          }
        }
      }
    }
  }

  const msg = err instanceof Error ? err.message : String(err)
  const match =
    msg.match(/retry\s*(?:after|in)?\s*[:]?\s*(\d+(?:\.\d+)?)\s*s/i) ||
    msg.match(/retryDelay["']?\s*:\s*["']?(\d+(?:\.\d+)?)s/i) ||
    msg.match(/retry after (\d+)/i)
  if (match) {
    const sec = parseFloat(match[1])
    if (!isNaN(sec) && sec > 0) return Math.ceil(sec)
  }

  return undefined
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.setHeader('X-Demo', '1')
    return res.status(200).json(DEMO_NETLIST)
  }

  const body = (req.body ?? {}) as {
    image?: unknown
    hint?: unknown
    mimeType?: unknown
  }

  if (!body.image || typeof body.image !== 'string') {
    return res.status(400).json({ error: 'Missing image field (base64)' })
  }

  const cleanImage = stripDataUrlPrefix(body.image)
  if (!cleanImage) {
    return res.status(400).json({ error: 'Empty image data' })
  }

  if (isPayloadTooLarge(cleanImage)) {
    return res.status(413).json({ error: 'Image exceeds 4MB limit' })
  }

  const mimeCheck = normalizeAndValidateMimeType(body.mimeType)
  if (!mimeCheck.ok) {
    return res.status(400).json({ error: mimeCheck.error })
  }
  const mimeType = mimeCheck.mimeType

  const hint = typeof body.hint === 'string' ? body.hint : undefined
  const primaryModel = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite'
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL

  const promptText = buildPrompt(hint)
  const ai = new GoogleGenAI({ apiKey })

  const contents = [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType,
            data: cleanImage,
          },
        },
        { text: promptText },
      ],
    },
  ]

  async function generateWithModel(targetModel: string): Promise<string> {
    try {
      const result = await ai.models.generateContent({
        model: targetModel,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: NETLIST_SCHEMA,
        },
      })
      return result.text ?? ''
    } catch (err: unknown) {
      if (isSchemaUnsupportedError(err)) {
        // Fallback without schema once
        const fallbackResult = await ai.models.generateContent({
          model: targetModel,
          contents,
        })
        return fallbackResult.text ?? ''
      }
      throw err
    }
  }

  let text: string | undefined

  try {
    try {
      text = await generateWithModel(primaryModel)
    } catch (primaryErr: unknown) {
      // 5xx retry: wait 1.5s and retry once
      if (is5xx(primaryErr)) {
        await new Promise((r) => setTimeout(r, 1500))
        text = await generateWithModel(primaryModel)
      } else if (is429(primaryErr)) {
        // 429 handling: if GEMINI_FALLBACK_MODEL is configured, try it once before giving up
        if (fallbackModel && fallbackModel !== primaryModel) {
          console.error(`Gemini 429 on ${primaryModel}, trying fallback model: ${fallbackModel}`)
          text = await generateWithModel(fallbackModel)
        } else {
          // Do NOT retry on 429 more than once
          throw primaryErr
        }
      } else {
        throw primaryErr
      }
    }

    // Safely parse JSON from model output
    let parsedJson: unknown
    try {
      parsedJson = extractJsonFromText(text)
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
      console.error('Gemini output could not be parsed as JSON:', msg)
      return res.status(422).json({ error: 'unreadable' })
    }

    // Validate against Netlist shape
    const validation = validateNetlist(parsedJson)
    if (!validation.ok) {
      console.error('Gemini circuit validation failed:', validation.error)
      return res.status(422).json({ error: 'unreadable' })
    }

    return res.status(200).json(validation.netlist)
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err)
    const sanitised = apiKey ? rawMsg.replaceAll(apiKey, '[REDACTED]') : rawMsg
    console.error('Gemini scan server error:', sanitised)

    if (is429(err)) {
      const retryAfterSeconds = extractRetryDelaySeconds(err) ?? 30
      res.setHeader('Retry-After', String(retryAfterSeconds))
      return res.status(429).json({ error: sanitised, retryAfterSeconds })
    }

    return res.status(500).json({ error: sanitised })
  }
}
