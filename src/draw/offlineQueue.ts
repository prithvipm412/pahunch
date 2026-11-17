/**
 * src/draw/offlineQueue.ts — persist compressed images in localStorage when
 * the network is unavailable, then drain them when the browser comes online.
 *
 * Rules:
 *  - Capped at 3 entries (drop oldest when full).
 *  - Replay ONE scan at a time, at least 8s apart.
 *  - Dedupe identical images using base64 hash.
 *  - If any replay gets a 429, stop replaying and try again on the next app load.
 *  - Show "Sending saved circuit 1 of N…".
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { hashBase64 } from './scanCache'

const STORAGE_KEY = 'pahunch-draw-queue'
const MAX_ENTRIES = 3

export interface QueueEntry {
  id: string
  hash: string
  base64: string
  savedAt: number
}

// In-memory session flag: if a 429 is received during drain, stop replaying for this app load.
let sessionRateLimited = false

export function resetSessionRateLimit(): void {
  sessionRateLimited = false
}

export function isSessionRateLimited(): boolean {
  return sessionRateLimited
}

function readQueue(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as QueueEntry[]
  } catch {
    return []
  }
}

function writeQueue(entries: QueueEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Storage full or disabled — silently ignore.
  }
}

/** Returns the number of items currently in the offline queue. */
export function queueSize(): number {
  return readQueue().length
}

/**
 * Enqueue a compressed image for later retry.
 * Dedupes by base64 hash, caps at 3 entries (dropping oldest).
 * Returns the new queue size, or -1 if storage is unavailable.
 */
export function enqueue(base64: string): number {
  const hash = hashBase64(base64)
  const entries = readQueue()
  // Dedupe: remove any existing entry with the same hash or identical base64
  const filtered = entries.filter((e) => e.hash !== hash && e.base64 !== base64)
  const entry: QueueEntry = {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    hash,
    base64,
    savedAt: Date.now(),
  }
  const next = [...filtered, entry].slice(-MAX_ENTRIES)
  writeQueue(next)
  return next.length
}

export type QueueSenderResult = { ok: boolean; rateLimited?: boolean } | boolean

export interface DrainProgress {
  current: number
  total: number
}

/**
 * Drain the queue by calling `sender` for each entry:
 *  - Replays ONE scan at a time, at least 8s apart (delayMs configurable for tests).
 *  - If sender returns 429 (rateLimited: true), stops replaying for this app load.
 *  - Calls onProgress with (current, total) before each scan.
 */
export async function drainQueue(
  sender: (base64: string) => Promise<QueueSenderResult>,
  onProgress?: (progress: DrainProgress) => void,
  delayMs: number = 8000,
): Promise<number> {
  if (sessionRateLimited) return 0

  const entries = readQueue()
  if (entries.length === 0) return 0

  const total = entries.length
  let sent = 0
  const remaining: QueueEntry[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]

    if (sessionRateLimited) {
      remaining.push(entry)
      continue
    }

    onProgress?.({ current: i + 1, total })

    let result: QueueSenderResult
    try {
      result = await sender(entry.base64)
    } catch {
      result = false
    }

    const isOk = typeof result === 'boolean' ? result : result.ok
    const isRateLimited = typeof result === 'object' && !!result.rateLimited

    if (isRateLimited) {
      sessionRateLimited = true
      remaining.push(entry)
      continue
    }

    if (isOk) {
      sent++
    } else {
      remaining.push(entry)
    }

    // Wait at least delayMs (default 8s) before next replay, if there are more items to send
    if (i < entries.length - 1 && !sessionRateLimited) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  writeQueue(remaining)
  return sent
}

export interface UseOfflineQueueReturn {
  size: number
  save: (base64: string) => void
  isDraining: boolean
  progress: DrainProgress | null
}

export function useOfflineQueue(
  sender: (base64: string) => Promise<QueueSenderResult>,
  delayMs: number = 8000,
): UseOfflineQueueReturn {
  const [size, setSize] = useState(() => queueSize())
  const [isDraining, setIsDraining] = useState(false)
  const [progress, setProgress] = useState<DrainProgress | null>(null)

  const senderRef = useRef(sender)
  senderRef.current = sender

  const save = useCallback((base64: string) => {
    const newSize = enqueue(base64)
    setSize(newSize < 0 ? 0 : newSize)
  }, [])

  const drain = useCallback(async () => {
    if (queueSize() === 0 || sessionRateLimited) return
    setIsDraining(true)
    try {
      await drainQueue(
        senderRef.current,
        (prog) => setProgress(prog),
        delayMs,
      )
    } finally {
      setSize(queueSize())
      setIsDraining(false)
      setProgress(null)
    }
  }, [delayMs])

  useEffect(() => {
    window.addEventListener('online', drain)
    if (navigator.onLine) void drain()
    return () => window.removeEventListener('online', drain)
  }, [drain])

  return { size, save, isDraining, progress }
}
