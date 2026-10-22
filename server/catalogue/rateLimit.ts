const MAX_KEYS = 10_000

// Fixed-window counter per client key. Memory is bounded: expired windows are dropped first, and
// if the table is still full a new key is refused rather than evicting a client that is limited.
export function rateLimiter(limit: number, windowMs = 60_000, now: () => number = Date.now) {
  const windows = new Map<string, { start: number; count: number }>()
  return (key: string): number => {
    const time = now()
    const current = windows.get(key)
    if (current && time - current.start < windowMs) {
      current.count += 1
      return current.count > limit ? Math.ceil((current.start + windowMs - time) / 1000) : 0
    }
    if (windows.size >= MAX_KEYS)
      for (const [k, w] of windows) if (time - w.start >= windowMs) windows.delete(k)
    if (windows.size >= MAX_KEYS) return Math.ceil(windowMs / 1000)
    windows.set(key, { start: time, count: 1 })
    return 0
  }
}
