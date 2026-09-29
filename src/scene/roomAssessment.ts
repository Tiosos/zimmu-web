import type { CarcaseComponent, Scene } from './types'
import type { RoomGeometry, RoomPoint, WallOpening, WallSegment } from './projectStructure'
import { operableFronts } from './projectStructure'
import { roomPoint, wallLength } from './roomGeometry'
import { resolveCarcase } from './carcaseOpenings'
import { carcaseBounds } from './carcaseBounds'
import { roleThicknessFor } from './resolveThickness'
import { rotateVector } from '../geom/transform'
import { worldBoundsOf } from './carcaseWorldBounds'

function footprint(cabinet: CarcaseComponent, scene: Scene): RoomPoint[] {
  const b = carcaseBounds(cabinet.params, roleThicknessFor(cabinet.params, scene.materials, new Map()))
  return corners(b.x0, b.x1, b.y0, b.y1).map((point) => placed(point, cabinet))
}

function corners(x0: number, x1: number, y0: number, y1: number): RoomPoint[] {
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
}

function placed(point: RoomPoint, cabinet: CarcaseComponent): RoomPoint {
  const rotated = rotateVector(cabinet.rotation, point.x, point.y, 0)
  return { x: cabinet.position.x + rotated[0], y: cabinet.position.y + rotated[1] }
}

function overlaps(a: RoomPoint[], b: RoomPoint[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const edge = { x: polygon[(i + 1) % polygon.length].x - polygon[i].x,
        y: polygon[(i + 1) % polygon.length].y - polygon[i].y }
      const axis = { x: -edge.y, y: edge.x }
      const valuesA = a.map((p) => p.x * axis.x + p.y * axis.y)
      const valuesB = b.map((p) => p.x * axis.x + p.y * axis.y)
      if (Math.max(...valuesA) <= Math.min(...valuesB) + 1e-6 ||
          Math.max(...valuesB) <= Math.min(...valuesA) + 1e-6) return false
    }
  }
  return true
}

export function doorSwingEnvelope(room: RoomGeometry, door: WallOpening): RoomPoint[] | null {
  const wall = room.walls.find((w) => w.id === door.wallId)
  if (!wall || !door.swing) return null
  const length = wallLength(wall)
  if (length === 0) return null
  const tangent = { x: (wall.end.x - wall.start.x) / length, y: (wall.end.y - wall.start.y) / length }
  const hingeOffset = door.offset + (door.swing.hinge === 'end' ? door.width : 0)
  const hinge = { x: wall.start.x + tangent.x * hingeOffset, y: wall.start.y + tangent.y * hingeOffset }
  const along = door.swing.hinge === 'start' ? 1 : -1
  const side = door.swing.side === 'left' ? 1 : -1
  const radius = door.swing.radius
  return [hinge,
    { x: hinge.x + tangent.x * along * radius, y: hinge.y + tangent.y * along * radius },
    { x: hinge.x + tangent.x * along * radius - tangent.y * side * radius,
      y: hinge.y + tangent.y * along * radius + tangent.x * side * radius },
    { x: hinge.x - tangent.y * side * radius, y: hinge.y + tangent.x * side * radius },
  ].map((point) => roomPoint(point, room))
}

export function clearanceIssues(room: RoomGeometry, scene: Scene, cabinetIds: ReadonlySet<string>): string[] {
  const cabinets = scene.components.filter((c): c is CarcaseComponent => c.kind === 'carcase' && cabinetIds.has(c.id))
  const issues: string[] = []
  for (const cabinet of cabinets) {
    const openings = resolveCarcase(cabinet, scene.parts, scene.materials)?.openings
    const fronts = operableFronts(cabinet.params.section)
    if (!openings && fronts.length) {
      issues.push(`${cabinet.label}: front clearances cannot be assessed until cabinet geometry resolves`)
      continue
    }
    for (const front of fronts) {
      const assumption = room.clearances?.find((c) => c.cabinetId === cabinet.id && c.sectionId === front.sectionId)
      if (!assumption) {
        issues.push(`${cabinet.label}: ${front.kind} ${front.sectionId} has no stated clearance projection`)
        continue
      }
      const opening = openings?.find((o) => o.sectionId === front.sectionId)
      if (!opening) continue
      const face = carcaseBounds(cabinet.params, roleThicknessFor(cabinet.params, scene.materials, new Map())).y0
      const envelope = corners(opening.rect.x0, opening.rect.x1, face - assumption.projection, face)
        .map((point) => placed(point, cabinet))
      const z0 = cabinet.position.z + opening.rect.z0
      const z1 = cabinet.position.z + opening.rect.z1
      for (const obstacle of room.obstacles) {
        if (z0 >= obstacle.height || z1 <= 0) continue
        const shape = corners(obstacle.position.x, obstacle.position.x + obstacle.width,
          obstacle.position.y, obstacle.position.y + obstacle.depth).map((point) => roomPoint(point, room))
        if (overlaps(envelope, shape))
          issues.push(`${cabinet.label}: ${front.kind} ${front.sectionId} may be blocked by ${obstacle.name}`)
      }
      for (const other of cabinets) {
        if (other.id === cabinet.id) continue
        const bounds = worldBoundsOf(other, scene.materials)
        if (z0 >= bounds.z1 || z1 <= bounds.z0) continue
        if (overlaps(envelope, footprint(other, scene)))
          issues.push(`${cabinet.label}: ${front.kind} ${front.sectionId} may be blocked by ${other.label}`)
      }
    }
  }
  for (const door of room.openings.filter((o) => o.kind === 'door')) {
    if (!door.swing) {
      issues.push(`Room door ${door.id}: hinge side and swing reach not assessed`)
      continue
    }
    const swing = doorSwingEnvelope(room, door)
    if (!swing) continue
    for (const cabinet of cabinets) {
      const b = worldBoundsOf(cabinet, scene.materials)
      if (b.z0 < door.sill + door.height && b.z1 > door.sill && overlaps(swing, footprint(cabinet, scene)))
        issues.push(`Room door ${door.id}: swing may be blocked by ${cabinet.label}`)
    }
    for (const obstacle of room.obstacles) {
      if (obstacle.height <= door.sill) continue
      const shape = corners(obstacle.position.x, obstacle.position.x + obstacle.width,
        obstacle.position.y, obstacle.position.y + obstacle.depth).map((point) => roomPoint(point, room))
      if (overlaps(swing, shape)) issues.push(`Room door ${door.id}: swing may be blocked by ${obstacle.name}`)
    }
  }
  return issues
}

export interface ElevationSpan { id: string; label: string; x0: number; x1: number; z0: number; z1: number }

export function wallElevation(room: RoomGeometry, wall: WallSegment, scene: Scene, cabinetIds: ReadonlySet<string>): ElevationSpan[] {
  const length = wallLength(wall)
  if (length === 0) return []
  const a = roomPoint(wall.start, room)
  const b = roomPoint(wall.end, room)
  const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  const spans: ElevationSpan[] = room.openings.filter((o) => o.wallId === wall.id).map((o) => ({
    id: o.id, label: `${o.kind} ${Math.round(o.width)} × ${Math.round(o.height)}`,
    x0: o.offset, x1: o.offset + o.width, z0: o.sill, z1: o.sill + o.height,
  }))
  for (const placement of room.placements.filter((p) => p.wallId === wall.id && cabinetIds.has(p.cabinetId))) {
    const cabinet = scene.components.find((c): c is CarcaseComponent => c.id === placement.cabinetId && c.kind === 'carcase')
    if (!cabinet) continue
    const projected = footprint(cabinet, scene).map((point) => (point.x - a.x) * tangent.x + (point.y - a.y) * tangent.y)
    const bounds = worldBoundsOf(cabinet, scene.materials)
    spans.push({ id: cabinet.id, label: cabinet.label,
      x0: Math.min(...projected), x1: Math.max(...projected), z0: bounds.z0, z1: bounds.z1 })
  }
  return spans
}
