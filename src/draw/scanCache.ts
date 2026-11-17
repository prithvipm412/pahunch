/**
 * scanCache.ts — LRU cache in localStorage for the last 10 scan results keyed by image hash.
 * A repeat photo returns instantly with no API call.
 */
import type { Netlist } from '../contracts/netlist'

const CACHE_KEY = 'pahunch-draw-cache'
const MAX_CACHE_ENTRIES = 10

export interface CachedScanEntry {
  hash: string
  netlist: Netlist
  confidence: number
  isDemo: boolean
  timestamp: number
}

/** Fast deterministic 64-bit hash of base64 string */
export function hashBase64(base64: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c64e6d
  for (let i = 0; i < base64.length; i++) {
    const ch = base64.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

function readCache(): CachedScanEntry[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as CachedScanEntry[]
  } catch {
    return []
  }
}

function writeCache(entries: CachedScanEntry[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries))
  } catch {
    // storage full or disabled
  }
}

/** Retrieve cached scan result for an image hash, or null */
export function getCachedScan(hash: string): CachedScanEntry | null {
  const entries = readCache()
  const found = entries.find((e) => e.hash === hash)
  if (!found) return null
  return found
}

/** Store a scan result in cache, maintaining max 10 entries (newest kept) */
export function setCachedScan(
  hash: string,
  data: { netlist: Netlist; confidence: number; isDemo: boolean },
): void {
  const entries = readCache().filter((e) => e.hash !== hash)
  const newEntry: CachedScanEntry = {
    hash,
    netlist: data.netlist,
    confidence: data.confidence,
    isDemo: data.isDemo,
    timestamp: Date.now(),
  }
  const updated = [...entries, newEntry].slice(-MAX_CACHE_ENTRIES)
  writeCache(updated)
}

/** Clear cache (useful for testing) */
export function clearScanCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
