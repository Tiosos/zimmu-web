import type { RoomGeometry, SiteMeasurement, WallSegment } from '../scene/projectStructure'
import type { Scene } from '../scene/types'
import { wallElevation, type ElevationSpan } from '../scene/roomAssessment'
import { lengthVerified, wallLength } from '../scene/roomGeometry'
import type { AssemblyDim } from './assembly'
import type { Rect2D } from './drawing'

// Below this two breakpoints are one. Sub-millimetre slivers would print a "0" chain segment.
const EPS = 0.5

export interface WallLength {
  drawn: number
  measured?: SiteMeasurement
  // True only when a site value exists AND agrees with the drawn length within its uncertainty.
  verified: boolean
}

// In unscaled millimetres: x runs along the wall from its start (shifted so the leftmost thing
// drawn is at 0), z runs up from the floor. Two consumers — the Room panel and the elevation sheet —
// scale it differently, so it carries no scale and no page offset.
export interface WallElevationView {
  wallId: string
  wallName: string
  bounds: Rect2D
  // Where the wall's own start sits in view space: 0 unless a span hangs out past the start.
  originX: number
  // Where the floor sits in view space: 0 unless a span hangs below it, in which case everything is
  // shifted up so the lowest thing drawn is at 0. Dimension LABELS keep their real heights.
  floorZ: number
  spans: ElevationSpan[]
  dims: AssemblyDim[]
  length: WallLength
}

const mm = (n: number): string => String(Math.round(n))
const fig = (n: number): string => String(Number(n.toFixed(1)))

// A drawn length is never presented as a site measurement: "drawn" is in the label itself.
export function lengthLabel(length: WallLength): string {
  const { drawn, measured } = length
  if (!measured) return `${mm(drawn)} drawn — unverified`
  const tolerance = `±${fig(measured.uncertainty)}`
  return length.verified
    ? `${fig(measured.value)} ${tolerance} (site)`
    : `drawn ${mm(drawn)} / site ${fig(measured.value)} ${tolerance}`
}

type FlatDim = Omit<AssemblyDim, 'ring'>

// The first ring whose existing dimensions this one does not overlap. A fourth overlapping
// dimension shares ring 3: three heights already cover every wall the Room panel can describe.
function ringed(dims: FlatDim[]): AssemblyDim[] {
  const taken: FlatDim[][] = [[], [], []]
  return dims.map((d) => {
    const free = taken.findIndex((ring) => ring.every((t) => d.end <= t.start || d.start >= t.end))
    const ring = (free === -1 ? 3 : free + 1) as 1 | 2 | 3
    taken[ring - 1].push(d)
    return { ...d, ring }
  })
}

function verticalDims(
  spans: ElevationSpan[],
  kind: ElevationSpan['kind'],
  side: 'left' | 'right',
  floorZ: number,
): AssemblyDim[] {
  const seen = new Set<string>()
  const flat: FlatDim[] = []
  const add = (start: number, end: number) => {
    const key = `${Math.round(start)}:${Math.round(end)}`
    if (seen.has(key)) return
    seen.add(key)
    flat.push({ axis: 'v', side, start, end, label: mm(end - start) })
  }
  for (const span of spans.filter((s) => s.kind === kind)) {
    if (span.z0 > floorZ + EPS) add(floorZ, span.z0)
    add(span.z0, span.z1)
  }
  return ringed(flat)
}

export function buildWallElevation(
  room: RoomGeometry,
  wall: WallSegment,
  scene: Scene,
  cabinetIds: ReadonlySet<string>,
): WallElevationView {
  const drawn = wallLength(wall)
  const raw = wallElevation(room, wall, scene, cabinetIds)
  const xMin = Math.min(0, ...raw.map((s) => s.x0))
  const xMax = Math.max(drawn, ...raw.map((s) => s.x1))
  const lowest = Math.min(0, ...raw.map((s) => s.z0))
  const floorZ = lowest < 0 ? -lowest : 0
  const spans = raw.map((s) => ({
    ...s,
    x0: s.x0 - xMin,
    x1: s.x1 - xMin,
    z0: s.z0 + floorZ,
    z1: s.z1 + floorZ,
  }))
  const originX = 0 - xMin

  const measured = wall.measuredLength
  const length: WallLength = {
    drawn,
    ...(measured ? { measured } : {}),
    verified: measured !== undefined && lengthVerified(drawn, measured),
  }

  const breaks = [originX, originX + drawn, ...spans.flatMap((s) => [s.x0, s.x1])].sort((a, b) => a - b)
  const unique = breaks.filter((x, i) => i === 0 || x - breaks[i - 1] > EPS)
  const chain: AssemblyDim[] = unique.slice(1).map((end, i) => ({
    axis: 'h',
    side: 'below',
    ring: 1,
    start: unique[i],
    end,
    label: mm(end - unique[i]),
  }))
  const overall: AssemblyDim = {
    axis: 'h',
    side: 'below',
    ring: 2,
    start: originX,
    end: originX + drawn,
    label: lengthLabel(length),
  }

  return {
    wallId: wall.id,
    wallName: wall.name,
    bounds: { x: 0, y: 0, w: xMax - xMin, h: Math.max(1, ...spans.map((s) => s.z1)) },
    originX,
    floorZ,
    spans,
    dims: [
      ...chain,
      overall,
      ...verticalDims(spans, 'cabinet', 'left', floorZ),
      ...verticalDims(spans, 'opening', 'right', floorZ),
    ],
    length,
  }
}
