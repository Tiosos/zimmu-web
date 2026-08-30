// The occlusion rule, stated once. Every silhouette in a cabinet projection is an axis-aligned
// rectangle, so an occluder always covers a *contiguous run* of an edge — which makes hidden-line
// removal 1-D interval subtraction rather than polygon clipping.
//
// One function answers both questions the projector asks:
//
//   visible = subtractIntervals(edge, covered)
//   hidden  = subtractIntervals(edge, visible)
//
// A second implementation for the second question is a second thing to get wrong.

export interface Span {
  a: number
  b: number
}

// A nanometre: far below any dimension a cabinet has, far above the float noise in a coordinate
// computed through a few additions around 1000. Shared with assembly.ts so the occlusion comparator
// and the axis-alignment test cannot drift apart from this one.
export const EPS = 1e-6

export function subtractIntervals(span: Span, holes: Span[]): Span[] {
  const out: Span[] = []
  let cursor = span.a

  // Sorted here rather than trusted from the caller: the projector collects occluders by walking
  // parts in depth order, which says nothing about where they land along this particular edge.
  const sorted = [...holes].sort((p, q) => p.a - q.a)

  for (const h of sorted) {
    if (h.b <= cursor + EPS) continue
    if (h.a >= span.b - EPS) break
    if (h.a > cursor + EPS) out.push({ a: cursor, b: Math.min(h.a, span.b) })
    cursor = Math.max(cursor, h.b)
    if (cursor >= span.b - EPS) return out
  }

  if (span.b > cursor + EPS) out.push({ a: cursor, b: span.b })
  return out
}
