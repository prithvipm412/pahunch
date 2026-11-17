/**
 * scanApi.ts — client-side wrapper for POST /api/scan.
 *
 * Friendly error mapping for students:
 *  - Network failure → "No network. Use Build mode for now."
 *  - 429 Rate limit → "Busy, try again in Ns" / "Too many scans, wait a minute and try again."
 *  - Server / model error (or 422 unreadable) → "Couldn't read the circuit right now. Try a sample drawing or Build mode."
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
  retryAfterSeconds?: number
}

export type ScanResult = ScanSuccess | ScanFailure

export const ERROR_MESSAGES = {
  network: 'No network. Use Build mode for now.',
  rateLimit: 'Too many scans, wait a minute and try again.',
  server: "Couldn't read the circuit right now. Try a sample drawing or Build mode.",
} as const

export async function scanCircuit(
  base64: string,
  hint?: string,
  mimeType: string = 'image/jpeg',
): Promise<ScanResult> {
  // Defensively ensure pure base64 without any data URL prefix
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '').trim()

  let response: Response
  try {
    response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: cleanBase64, mimeType, hint }),
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
    let retryAfterSeconds: number | undefined
    try {
      const body = (await response.json()) as { error?: string; retryAfterSeconds?: number }
      if (body.error) rawError = body.error
      if (typeof body.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0) {
        retryAfterSeconds = body.retryAfterSeconds
      }
    } catch {
      // ignore parse failure
    }

    // Check Retry-After header if not in JSON body
    if (retryAfterSeconds === undefined && response.headers?.get) {
      const headerVal = response.headers.get('Retry-After')
      if (headerVal) {
        const sec = parseInt(headerVal, 10)
        if (!isNaN(sec) && sec > 0) retryAfterSeconds = sec
      }
    }

    console.error('Scan server/model raw error:', rawError)

    if (response.status === 429 || /429|resource_exhausted|quota/i.test(rawError)) {
      const sec = retryAfterSeconds ?? 30
      return {
        ok: false,
        reason: 'rate_limit',
        message: `Busy, try again in ${sec}s`,
        retryAfterSeconds: sec,
      }
    }

    // Server errors (500, 422 unreadable, 413 payload too large, 400 bad request, etc.)
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
