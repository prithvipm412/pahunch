import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI, Type } from '@google/genai'
import type { Netlist } from '../src/contracts/netlist.ts'

export interface ScanApiResponse extends Netlist {
  confidence?: number
}

// Demo netlist returned when no API key is set (2 bulbs in series with a battery)
const DEMO_NETLIST: ScanApiResponse = {
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
const NETLIST_SCHEMA = {
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

function buildPrompt(hint?: string): string {
  const base = `You are an expert circuit-reading assistant for a school DC electricity learning app.

Read the hand-drawn DC circuit in this image using standard circuit schematic symbols:

### FEW-SHOT SYMBOL DESCRIPTIONS:
1. Battery (DC voltage source):
   - Drawn as two or more parallel lines perpendicular to the wire: a long thin positive line and a shorter thicker negative line, or stacked cell pairs with + / - markings.
   - Example component: { "id": "bat1", "type": "battery", "from": {"row": 0, "col": 0}, "to": {"row": 0, "col": 1}, "value": 9 }

2. Bulb / Lamp (resistive load that glows):
   - Drawn as a circle with an 'X' inside, or a circle with a filament loop inside.
   - Example component: { "id": "bulb1", "type": "bulb", "from": {"row": 0, "col": 1}, "to": {"row": 0, "col": 2} }

3. Resistor (current limiter):
   - Drawn as a zigzag line (sharp peaks and valleys) or a clean rectangle along the wire.
   - Example component: { "id": "res1", "type": "resistor", "from": {"row": 1, "col": 2}, "to": {"row": 1, "col": 3}, "value": 10 }

4. Switch (circuit breaker / controller):
   - Drawn as a gap in the wire with an angled lever/blade (open switch: closed = false), or a straight lever bridging two terminal dots (closed switch: closed = true).
   - Example component: { "id": "sw1", "type": "switch", "from": {"row": 0, "col": 2}, "to": {"row": 0, "col": 3}, "closed": true }

5. Wire (conductive path):
   - Drawn as plain straight lines connecting components or turning 90-degree corners.
   - Example component: { "id": "wire1", "type": "wire", "from": {"row": 0, "col": 3}, "to": {"row": 1, "col": 3} }

### CRITICAL JUNCTION & TOPOLOGY RULES:
- 5×5 Grid: Map all components onto a 5×5 grid (rows 0–4, cols 0–4). Preserving which parts connect to which.
- Junctions: Two components connect ONLY if they share the exact same grid point { row, col }.
- Crossing lines without a dot do NOT connect: If two lines cross without a clear junction dot, they bridge over each other and do NOT share a grid point.
- Closed loop: If a closed loop is drawn, ALWAYS return an unbroken closed loop of components and wires so the circuit path is electrically complete. Never leave accidental gaps or open ends if the drawing was intended as a closed circuit.
- Do NOT invent components: Only include parts visibly present in the drawing.
- Confidence score (0.0 to 1.0):
  - 0.85 - 1.0: Crystal clear drawing, unambiguous symbols, fully closed loop.
  - 0.60 - 0.84: Readable drawing with minor handwriting noise, slight tilt, or lightly drawn lines.
  - Below 0.60: Faint, blurry, ambiguous symbols, incomplete paths, or uncertain component types.

Set gridSize to 5, source to "draw", and return valid JSON matching the schema.`

  if (hint) {
    return `${base}

IMPORTANT — the previous reading had this validation error: "${hint}"
Re-examine the image carefully with this error in mind and correct the netlist.`
  }
  return base
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

  const { image, hint } = req.body as { image?: string; hint?: string }
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing image field (base64 JPEG)' })
  }

  const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'

  try {
    const ai = new GoogleGenAI({ apiKey })
    const result = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: image,
              },
            },
            { text: buildPrompt(hint) },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: NETLIST_SCHEMA,
      },
    })

    const text = result.text ?? ''
    const data = JSON.parse(text) as ScanApiResponse
    // Always stamp source as 'draw' — never trust model to do it correctly
    data.source = 'draw'
    if (!data.gridSize) data.gridSize = 5
    if (typeof data.confidence === 'number') {
      data.confidence = Math.max(0, Math.min(1, data.confidence))
    } else {
      data.confidence = 0.9
    }

    return res.status(200).json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Never surface the API key in error messages
    const sanitised = message.replace(apiKey, '[REDACTED]')
    return res.status(500).json({ error: sanitised })
  }
}
