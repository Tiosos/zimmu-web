import type { CarcaseComponent } from './types'

// Bound all count-driven geometry work, including fixed shelves and pin holes, before reporting.
export function productionLimitIssue(cabinet: CarcaseComponent): string | null {
  const p = cabinet.params
  if ([p.width, p.height, p.depth].some((n) => !Number.isFinite(n) || n <= 0))
    return 'Cabinet dimensions must be finite and positive.'
  if ([p.width, p.height, p.depth].some((n) => n > 100_000))
    return 'Assessment skipped: cabinet dimensions exceed the report limit of 100,000 mm.'
  let nodes = 0
  let quantities = 0
  let structure = 0
  const walk = (value: unknown, key = ''): boolean => {
    if (++nodes > 20_000) return false
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return false
      if (['shelves', 'fixedShelves', 'count'].includes(key)) {
        if (!Number.isSafeInteger(value) || value < 0) return false
        quantities += value
        if (quantities > 3000) return false
        if (key === 'fixedShelves') structure += value
        if (structure > 100) return false
      }
    } else if (value && typeof value === 'object') {
      return Object.entries(value).every(([k, v]) => walk(v, k))
    }
    return true
  }
  return walk(p)
    ? null
    : 'Assessment skipped: invalid numeric parameters or the report complexity limit was exceeded.'
}
