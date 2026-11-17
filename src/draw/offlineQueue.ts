/**
 * src/draw/offlineQueue.ts — persist compressed images in localStorage when
 * the network is unavailable, then drain them when the browser comes online.
 *
 * Rules:
 *  - At most 5 entries kept (oldest dropped when full).
 *  - Each entry is a base64 JPEG string.
 *  - Callers supply a `sender` function (wrapping scanCircuit); the queue
 *    calls it one-by-one on drain.
 *  - All localStorage access is wrapped in try/catch (quota / private mode).
 */

const STORAGE_KEY = 'pahunch-draw-queue'
const MAX_ENTRIES = 5

export interface QueueEntry {
  id: string
  base64: string
  savedAt: number
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
 * Returns the new queue size, or -1 if storage is unavailable.
 */
export function enqueue(base64: string): number {
  const entries = readQueue()
  const entry: QueueEntry = {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    base64,
    savedAt: Date.now(),
  }
  const next = [...entries, entry].slice(-MAX_ENTRIES) // keep newest MAX_ENTRIES
  writeQueue(next)
  return next.length
}

/**
 * Drain the queue by calling `sender` for each entry.
 * Successfully sent entries are removed; failed ones are left in place.
 * Returns the number of entries successfully sent.
 */
export async function drainQueue(
  sender: (base64: string) => Promise<boolean>,
): Promise<number> {
  const entries = readQueue()
  if (entries.length === 0) return 0

  let sent = 0
  const remaining: QueueEntry[] = []

  for (const entry of entries) {
    const ok = await sender(entry.base64)
    if (ok) {
      sent++
    } else {
      remaining.push(entry)
    }
  }

  writeQueue(remaining)
  return sent
}

/**
 * React hook that:
 *  - Tracks the live queue size in state.
 *  - Listens for the browser `online` event and auto-drains.
 *  - Returns { size, enqueue, isDraining }.
 */
import { useState, useEffect, useCallback, useRef } from 'react'

export interface UseOfflineQueueReturn {
  size: number
  save: (base64: string) => void
  isDraining: boolean
}

export function useOfflineQueue(
  sender: (base64: string) => Promise<boolean>,
): UseOfflineQueueReturn {
  const [size, setSize] = useState(() => queueSize())
  const [isDraining, setIsDraining] = useState(false)
  // Keep a stable ref to sender so the effect closure doesn't go stale.
  const senderRef = useRef(sender)
  senderRef.current = sender

  const save = useCallback((base64: string) => {
    const newSize = enqueue(base64)
    setSize(newSize < 0 ? 0 : newSize)
  }, [])

  const drain = useCallback(async () => {
    if (queueSize() === 0) return
    setIsDraining(true)
    try {
      await drainQueue(senderRef.current)
    } finally {
      setSize(queueSize())
      setIsDraining(false)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('online', drain)
    // Attempt a drain immediately if we're already online (e.g. page refresh).
    if (navigator.onLine) void drain()
    return () => window.removeEventListener('online', drain)
  }, [drain])

  return { size, save, isDraining }
}
