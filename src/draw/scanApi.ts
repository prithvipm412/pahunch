/**
 * scanApi.ts — client-side wrapper for POST /api/scan.
 * Handles network errors and returns a typed result including confidence score.
 */
import type { Netlist } from '../contracts/netlist'

export interface ScanSuccess {
  ok: true
  netlist: Netlist
  confidence: number
  isDemo: boolean
}

export interface ScanFailure {
  ok: false
  reason: 'network' | 'server'
  message: string
}

export type ScanResult = ScanSuccess | ScanFailure

export async function scanCircuit(base64: string, hint?: string): Promise<ScanResult> {
  let response: Response
  try {
    response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, hint }),
    })
  } catch {
    return { ok: false, reason: 'network', message: 'No network. Use Build mode for now.' }
  }

  if (!response.ok) {
    let message = `Server error ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore JSON parse failure
    }
    return { ok: false, reason: 'server', message }
  }

  const isDemo = response.headers.get('X-Demo') === '1'
  const data = (await response.json()) as Netlist & { confidence?: number }
  const confidence = typeof data.confidence === 'number' ? data.confidence : 1.0
  return { ok: true, netlist: data, confidence, isDemo }
}
