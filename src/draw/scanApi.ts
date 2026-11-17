/**
 * scanApi.ts — client-side wrapper for POST /api/scan.
 *
 * Friendly error mapping for students:
 *  - Network failure → "No network. Use Build mode for now."
 *  - 429 Rate limit → "Too many scans, wait a minute and try again."
 *  - Server / model error → "Couldn't read the circuit right now. Try a sample drawing or Build mode."
 *
 * Raw errors are logged to the console only and never displayed as raw JSON in the UI.
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
  reason: 'network' | 'rate_limit' | 'server'
  message: string
}

export type ScanResult = ScanSuccess | ScanFailure

export const ERROR_MESSAGES = {
  network: 'No network. Use Build mode for now.',
  rateLimit: 'Too many scans, wait a minute and try again.',
  server: "Couldn't read the circuit right now. Try a sample drawing or Build mode.",
} as const

export async function scanCircuit(base64: string, hint?: string): Promise<ScanResult> {
  let response: Response
  try {
    response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, hint }),
    })
  } catch (err) {
    console.error('Scan network error (raw):', err)
    return {
      ok: false,
      reason: 'network',
      message: ERROR_MESSAGES.network,
    }
  }

  if (!response.ok) {
    let rawError = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) rawError = body.error
    } catch {
      // ignore parse failure
    }

    console.error('Scan server/model raw error:', rawError)

    if (response.status === 429 || /429|resource_exhausted|quota/i.test(rawError)) {
      return {
        ok: false,
        reason: 'rate_limit',
        message: ERROR_MESSAGES.rateLimit,
      }
    }

    return {
      ok: false,
      reason: 'server',
      message: ERROR_MESSAGES.server,
    }
  }

  try {
    const isDemo = response.headers.get('X-Demo') === '1'
    const data = (await response.json()) as Netlist & { confidence?: number }
    const confidence = typeof data.confidence === 'number' ? data.confidence : 1.0
    return { ok: true, netlist: data, confidence, isDemo }
  } catch (err) {
    console.error('Scan JSON decode error (raw):', err)
    return {
      ok: false,
      reason: 'server',
      message: ERROR_MESSAGES.server,
    }
  }
}
