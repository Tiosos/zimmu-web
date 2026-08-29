// The cabinet's interior division, as a recursive tree. Splitting a section is what *creates* the
// partition or shelf between its children — so this replaces `dividers` and `fixedShelves`, which
// described the same divisions twice.
//
// Stage A carries structure only. `interior` (per-section shelves) arrives in Stage D and `front`
// in Stage E.

export type SectionId = string // "sec_<uuid>"

export interface AdjustableSpec {
  // How many boards actually sit in this section. New in Stage D: before it, an adjustable shelf
  // was only ever a row of holes, so nothing counted the shelves themselves.
  shelves: number
  // Pin positions per row — what the panel's "Pin count" field has always meant, and what
  // HoleArrayCut.count receives. Not a shelf count: a section with ten pin positions and two
  // shelves is ordinary.
  count: number
  rows: 1 | 2
  pitch: 32 // literal, not number: 32 mm *is* the system being modelled
  setback: number // front row, from the panel's front edge
  backSetback: number // back row, from the panel's back edge
}

export interface InteriorSpec {
  adjustable: AdjustableSpec
}

// What covers a section. Absent means nothing does — the same convention `interior` uses, so the
// model has one way to say "no front" rather than a field and a union member that both mean it.
//
// `hinge` is read only when `leaves === 1`: a pair of doors is hinged at both outer edges, and a
// field that is meaningless half the time is a field that will be set wrong.
export type FrontSpec =
  | { kind: 'door'; leaves: 1 | 2; hinge: 'left' | 'right' }
  | { kind: 'drawer-front' }
  | { kind: 'false-front' }
  | { kind: 'panel' }

export type SectionSize =
  | { kind: 'equal' }
  | { kind: 'fixed'; mm: number }
  | { kind: 'percent'; pct: number }

export type DivisionKind = 'none' | 'panel' | 'rail'

export type SectionContent =
  | { kind: 'leaf' }
  | {
      kind: 'split'
      axis: 'vertical' | 'horizontal'
      division: DivisionKind
      children: Section[]
    }

export interface Section {
  // A uuid, never a path. `regenerateOne` reconciles parts by role key; a positional key would
  // renumber every sibling when a section is inserted, re-binding parts that did not change.
  id: SectionId
  size: SectionSize
  content: SectionContent
  // Per-section shelving. Optional because most sections want nothing, and a required field would
  // put an empty spec on every leaf of every saved file.
  interior?: InteriorSpec
  // What covers this section. Optional for the same reason `interior` is.
  front?: FrontSpec
}

export function newSectionId(): SectionId {
  return `sec_${crypto.randomUUID()}`
}

export interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface ResolvedDivision {
  parentId: SectionId
  index: number // the i in `division-{parentId}-{i}`
  axis: 'vertical' | 'horizontal'
  kind: Exclude<DivisionKind, 'none'>
  rect: Rect
}

// Answers a division's own thickness. Stage A always returns the carcase thickness; Stage B makes
// it depend on the division part's material and override, which is why it is a function and not a
// number.
export type DivisionThickness = (parentId: SectionId, index: number) => number

export type Bound = { kind: 'shell' } | { kind: 'division'; parentId: SectionId; index: number }

export interface SectionBounds {
  left: Bound
  right: Bound
  bottom: Bound
  top: Bound
}

export interface ResolvedTree {
  rects: Map<SectionId, Rect>
  divisions: ResolvedDivision[]
  childRects: (parentId: SectionId) => Rect[]
  // What encloses a section on each side: the division it shares with a sibling, or — where the
  // split it belongs to has no sibling that way — whatever encloses its parent, ultimately the
  // shell. A shelf is housed in the bay's bounds, not in the cabinet's, which only this can say.
  boundsOf: (id: SectionId) => SectionBounds
  // Where a section sits inside its parent's split. `undefined` for the root, which has no parent.
  // A label needs this to say which bay a shelf is in.
  placeOf: (id: SectionId) => SectionPlace | undefined
}

export interface SectionPlace {
  parentId: SectionId
  axis: 'vertical' | 'horizontal'
  index: number
  count: number
}

export function resolveSections(
  root: Section,
  opening: Rect,
  thicknessOf: DivisionThickness,
): ResolvedTree {
  const rects = new Map<SectionId, Rect>()
  const divisions: ResolvedDivision[] = []
  const childIds = new Map<SectionId, SectionId[]>()
  const neighbours = new Map<SectionId, SectionPlace>()

  const place = (section: Section, rect: Rect): void => {
    rects.set(section.id, rect)
    if (section.content.kind === 'leaf') return

    const { axis, division, children } = section.content
    const vertical = axis === 'vertical'
    const lo = vertical ? rect.x0 : rect.z0
    const hi = vertical ? rect.x1 : rect.z1

    const gaps =
      division === 'none' ? [] : children.slice(1).map((_, i) => thicknessOf(section.id, i))
    const clear = hi - lo - gaps.reduce((s, n) => s + n, 0)
    const spans = resolveSpans(children, clear)

    childIds.set(
      section.id,
      children.map((c) => c.id),
    )

    let cursor = lo
    children.forEach((child, i) => {
      neighbours.set(child.id, {
        parentId: section.id,
        axis,
        index: i,
        count: children.length,
      })
      const span = spans[i]
      place(
        child,
        vertical
          ? { ...rect, x0: cursor, x1: cursor + span }
          : { ...rect, z0: cursor, z1: cursor + span },
      )
      cursor += span
      if (i < gaps.length) {
        divisions.push({
          parentId: section.id,
          index: i,
          axis,
          kind: division as Exclude<DivisionKind, 'none'>,
          rect: vertical
            ? { ...rect, x0: cursor, x1: cursor + gaps[i] }
            : { ...rect, z0: cursor, z1: cursor + gaps[i] },
        })
        cursor += gaps[i]
      }
    })
  }

  place(root, opening)

  const hasDivision = (parentId: SectionId, index: number): boolean =>
    divisions.some((d) => d.parentId === parentId && d.index === index)

  const boundsOf = (id: SectionId): SectionBounds => {
    const sides: SectionBounds = {
      left: { kind: 'shell' },
      right: { kind: 'shell' },
      bottom: { kind: 'shell' },
      top: { kind: 'shell' },
    }
    let cursor: SectionId | undefined = id
    while (cursor !== undefined) {
      const n = neighbours.get(cursor)
      if (n === undefined) break
      const [lowSide, highSide] =
        n.axis === 'vertical' ? (['left', 'right'] as const) : (['bottom', 'top'] as const)
      if (sides[lowSide].kind === 'shell' && n.index > 0 && hasDivision(n.parentId, n.index - 1)) {
        sides[lowSide] = { kind: 'division', parentId: n.parentId, index: n.index - 1 }
      }
      if (
        sides[highSide].kind === 'shell' &&
        n.index < n.count - 1 &&
        hasDivision(n.parentId, n.index)
      ) {
        sides[highSide] = { kind: 'division', parentId: n.parentId, index: n.index }
      }
      cursor = n.parentId
    }
    return sides
  }

  return {
    rects,
    divisions,
    childRects: (parentId) => (childIds.get(parentId) ?? []).map((id) => rects.get(id)!),
    boundsOf,
    placeOf: (id) => neighbours.get(id),
  }
}

// Fixed children take their millimetres; percent children take their share of the clear span; equal
// children split whatever is left. Stated once so the validator and the layout cannot disagree.
function resolveSpans(children: Section[], clear: number): number[] {
  const spans = children.map((c) =>
    c.size.kind === 'fixed'
      ? c.size.mm
      : c.size.kind === 'percent'
        ? (c.size.pct / 100) * clear
        : 0,
  )
  const claimed = spans.reduce((s, n) => s + n, 0)
  const equals = children.filter((c) => c.size.kind === 'equal').length
  if (equals === 0) return spans
  const each = (clear - claimed) / equals
  return children.map((c, i) => (c.size.kind === 'equal' ? each : spans[i]))
}

// Total and side-effect free, matching `validateCarcaseParams`: the generator calls this on every
// keystroke and emits nothing when it returns errors, so last-good parts survive a transient state.
// Every problem is collected — reporting one at a time turns fixing three mistakes into three
// round trips.
export function validateSection(root: Section): string[] {
  const errors: string[] = []
  const seen = new Set<SectionId>()

  const walk = (s: Section): void => {
    if (seen.has(s.id)) errors.push('section ids must be unique')
    seen.add(s.id)

    if (s.size.kind === 'fixed' && s.size.mm <= 0) {
      errors.push('a fixed section size must be positive')
    }
    if (s.size.kind === 'percent' && (s.size.pct <= 0 || s.size.pct > 100)) {
      errors.push('a section percentage must be between 0 and 100')
    }
    // The rule the cabinet-wide bundle used to carry: a negative pin count is meaningless, and the
    // section that states it is now the only place it can be caught.
    if (s.interior !== undefined && s.interior.adjustable.count < 0) {
      errors.push('adjustable shelf count must be 0 or more')
    }
    if (s.content.kind === 'leaf') return

    const { axis, division, children } = s.content
    if (children.length < 2) errors.push('a split needs at least two sections')
    // A vertical stretcher across a front is a mullion — a different part with different joinery.
    if (division === 'rail' && axis === 'vertical') {
      errors.push('a rail division needs a horizontal split')
    }
    const pct = children.reduce((sum, c) => sum + (c.size.kind === 'percent' ? c.size.pct : 0), 0)
    if (pct > 100) errors.push('section percentages must not exceed 100')

    children.forEach(walk)
  }

  walk(root)
  return [...new Set(errors)]
}
