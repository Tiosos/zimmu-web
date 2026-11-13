// Findings for non-drilling cuts on one board, in part-local millimetres, ordered by cut. Drilling is
// handled by drillingIntersections; this module answers three questions: do box cuts claim the same
// material (reported once per connected group, at its first cut), does one of them remove nothing at
// all, and can a cut describe a volume? All three are advisory — a housing that runs into another
// housing (or into a toe-kick notch) is ordinary joinery the recorded geometry cannot distinguish
// from a mistake, a redundant cut is wasteful but harmless, and a non-finite cut is a record a
// designer is still editing.
import type {
  ManufacturingOperationReference,
  ManufacturingPart,
} from './manufacturingPart'
import { boxGeometryIsFinite, boxVolumeOf, type BoxVolume } from './cutVolumes'
import type { BoxCut } from './types'

export type CutIntersectionCode =
  | 'cut-intersection-review'
  | 'cut-redundant-review'
  | 'cut-geometry-review'
export interface CutIntersectionIssue {
  code: CutIntersectionCode
  message: string
  operation: ManufacturingOperationReference
}

interface AnchoredIssue {
  anchor: number
  issue: CutIntersectionIssue
}

const tolerance = 1e-6 // mm; the same boundary tolerance the drilling checks apply.
const axes = ['x', 'y', 'z'] as const
type Axis = (typeof axes)[number]

// The material two boxes both claim on one axis. A non-positive value means they do not share
// material there; touching at a face, edge or corner is how joinery meets, not an overlap.
function sharedExtent(a: BoxVolume, b: BoxVolume, axis: Axis): number {
  return Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis])
}

// A box lies inside another when every face is on or within the other's at the tolerance. The
// boundary is inclusive: a box ending exactly on the container's face is contained.
function containedBy(outer: BoxVolume, inner: BoxVolume): boolean {
  return axes.every(
    (axis) =>
      inner.min[axis] >= outer.min[axis] - tolerance &&
      inner.max[axis] <= outer.max[axis] + tolerance,
  )
}

function operationOf(cut: BoxCut): ManufacturingOperationReference {
  return {
    id: cut.id,
    label: cut.label,
    kind: 'box',
    sourceComponentId: cut.sourceComponentId ?? null,
    sourceJointId: cut.sourceJointId ?? null,
  }
}

function intersectionIssue(first: BoxCut, second: BoxCut): CutIntersectionIssue {
  return {
    code: 'cut-intersection-review',
    message: `Cut "${first.label}" [${first.id}]: shares removed material with cut "${second.label}" [${second.id}]; verify this is intended.`,
    operation: operationOf(first),
  }
}

function redundantIssue(
  inner: BoxCut,
  outer: BoxCut,
  kind: 'inside' | 'repeat',
): CutIntersectionIssue {
  return {
    code: 'cut-redundant-review',
    message:
      kind === 'inside'
        ? `Cut "${inner.label}" [${inner.id}]: lies entirely inside cut "${outer.label}" [${outer.id}]; it removes no additional material.`
        : `Cut "${inner.label}" [${inner.id}]: repeats cut "${outer.label}" [${outer.id}] at the same volume; one of the two can be removed.`,
    operation: operationOf(inner),
  }
}

function geometryIssue(cut: BoxCut): CutIntersectionIssue {
  return {
    code: 'cut-geometry-review',
    message: `Cut "${cut.label}" [${cut.id}]: has a non-finite position or size, so its removed volume is undefined; correct the geometry before machining.`,
    operation: operationOf(cut),
  }
}

function findRoot(parent: number[], i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]]
    i = parent[i]
  }
  return i
}

function union(parent: number[], a: number, b: number): void {
  const rootA = findRoot(parent, a)
  const rootB = findRoot(parent, b)
  if (rootA !== rootB) parent[rootB] = rootA
}

// Two or more others: join with commas and a final "and" (no Oxford comma).
function clusterIssue(anchor: BoxCut, others: BoxCut[]): CutIntersectionIssue {
  const names = others.map((cut) => `"${cut.label}" [${cut.id}]`)
  return {
    code: 'cut-intersection-review',
    message: `Cut "${anchor.label}" [${anchor.id}]: forms one connected group of overlapping cuts with ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}; verify this is intended.`,
    operation: operationOf(anchor),
  }
}

export function cutIntersections(part: ManufacturingPart): CutIntersectionIssue[] {
  if (part.kind !== 'board') return []
  const boxes: { cut: BoxCut; volume: BoxVolume; at: number }[] = []
  const anchored: AnchoredIssue[] = []
  part.cuts.forEach((cut, at) => {
    if (cut.kind !== 'box') return
    const volume = boxVolumeOf(cut)
    if (volume !== null) boxes.push({ cut, volume, at })
    else if (!boxGeometryIsFinite(cut)) anchored.push({ anchor: at, issue: geometryIssue(cut) })
  })

  const parent = boxes.map((_, i) => i)
  const plainPairs: [number, number][] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const first = boxes[i]
      const second = boxes[j]
      if (axes.some((axis) => sharedExtent(first.volume, second.volume, axis) <= tolerance))
        continue
      // Containment is an edge too: a contained cut can join a cluster through it, though only plain pairs trigger the finding.
      union(parent, i, j)
      const firstInSecond = containedBy(second.volume, first.volume)
      const secondInFirst = containedBy(first.volume, second.volume)
      if (firstInSecond && secondInFirst)
        anchored.push({
          anchor: second.at,
          issue: redundantIssue(second.cut, first.cut, 'repeat'),
        })
      else if (firstInSecond)
        anchored.push({ anchor: first.at, issue: redundantIssue(first.cut, second.cut, 'inside') })
      else if (secondInFirst)
        anchored.push({ anchor: second.at, issue: redundantIssue(second.cut, first.cut, 'inside') })
      else plainPairs.push([i, j])
    }
  }

  // root → member box indices, ascending, built after every union.
  const components = new Map<number, number[]>()
  for (let i = 0; i < boxes.length; i++) {
    const root = findRoot(parent, i)
    const members = components.get(root)
    if (members) members.push(i)
    else components.set(root, [i])
  }
  for (const root of new Set(plainPairs.map(([i]) => findRoot(parent, i)))) {
    const members = components.get(root)
    if (!members) continue
    const anchor = boxes[members[0]]
    const others = members.slice(1).map((i) => boxes[i].cut)
    anchored.push({
      anchor: anchor.at,
      issue:
        others.length === 1
          ? intersectionIssue(anchor.cut, others[0])
          : clusterIssue(anchor.cut, others),
    })
  }

  // Stable sort: ties keep emission order — geometry, then redundancies, then clusters.
  return anchored.sort((a, b) => a.anchor - b.anchor).map((entry) => entry.issue)
}
