import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI, Type } from '@google/genai'
import type { Netlist } from '../src/contracts/netlist.ts'

// Demo netlist returned when no API key is set (2 bulbs in series with a battery)
const DEMO_NETLIST: Netlist = {
  gridSize: 5,
  source: 'draw',
  components: [
    { id: 'bat1', type: 'battery', from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, value: 9 },
    { id: 'bulb1', type: 'bulb', from: { row: 0, col: 1 }, to: { row: 0, col: 2 } },
    { id: 'bulb2', type: 'bulb', from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
    { id: 'wire1', type: 'wire', from: { row: 0, col: 3 }, to: { row: 0, col: 0 } },
  ],
}

// Response schema matching the Netlist type for structured JSON output
const NETLIST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    gridSize: { type: Type.NUMBER },
    source: { type: Type.STRING },
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
  required: ['gridSize', 'source', 'components'],
}

function buildPrompt(hint?: string): string {
  const base = `You are a circuit-reading assistant for a school app.

Read the hand-drawn DC circuit in this image using standard symbols:
- Battery: two parallel lines (long positive, short negative) or a cell symbol
- Bulb / lamp: circle with a cross or filament inside
- Resistor: rectangle or zigzag line
- Switch: a gap or lever in the wire
- Wire: straight connecting lines

Your job:
1. Identify every component in the drawing.
2. Map each component onto a 5×5 grid (rows 0–4, cols 0–4) preserving the topology — which parts connect to which.
3. Two components connect ONLY if they share a grid point (same row AND col).
4. Assign a unique string id to each component (e.g. "bat1", "bulb1", "res1", "sw1", "wire1").
5. Set gridSize to 5 and source to "draw".
6. Never invent components that are not clearly visible in the image.
7. If a component has a readable value (e.g. "10Ω", "9V"), set the value field (numeric only).
8. For a switch, set closed: true if drawn closed (connected), false if open (gap).

Return ONLY valid JSON matching the Netlist schema. No explanation.`

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
    const netlist = JSON.parse(text) as Netlist
    // Always stamp source as 'draw' — never trust model to do it correctly
    netlist.source = 'draw'
    if (!netlist.gridSize) netlist.gridSize = 5

    return res.status(200).json(netlist)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Never surface the API key in error messages
    const sanitised = message.replace(apiKey, '[REDACTED]')
    return res.status(500).json({ error: sanitised })
  }
}
