import type { CarcaseComponent, Component, ComponentId, Part } from './types'
import { ancestorsOf } from './componentTree'

// Which cabinet a node belongs to, asked once and answered here.
//
// `ancestorsOf(...)[0]` is the *immediate* parent, which is the cabinet only when the part hangs
// directly off it. A part under a group, or under a drawer, answers the wrong component — and the
// cutting list and the hardware BOM were each written with their own version of that mistake.
// Stated once so the two cannot disagree about which cabinet a board was cut for.
export function nearestCarcase(
  node: Part | Component,
  byId: Map<ComponentId, Component>,
): CarcaseComponent | null {
  for (const ancestor of ancestorsOf(node, byId)) {
    if (ancestor.kind === 'carcase') return ancestor
  }
  return null
}
