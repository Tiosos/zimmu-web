import type { CarcaseComponent, Scene } from './types'
import type { RoomGeometry, RoomPoint, WallOpening, WallSegment } from './projectStructure'
import { operableFronts } from './projectStructure'
import { roomPoint, wallLength } from './roomGeometry'
import { resolveCarcase } from './carcaseOpenings'
import { frontCells } from './frontCells'
import { frontGeometryOf } from './carcaseRoles'
import { carcaseBounds } from './carcaseBounds'
import { roleThicknessFor } from './resolveThickness'
import { applyMatrixToPoint, resolveWorldMatrix } from '../geom/transform'
import { componentsById } from './componentTree'

function footprint(cabinet: CarcaseComponent, scene: Scene): RoomPoint[] {
  const b = carcaseBounds(cabinet.params, roleThicknessFor(cabinet.params, scene.materials, new Map()))
  return corners(b.x0, b.x1, b.y0, b.y1).map((point) => placed(point, cabinet, scene))
}

function corners(x0: number, x1: number, y0: number, y1: number): RoomPoint[] {
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
}

function placed(point: RoomPoint, cabinet: CarcaseComponent, scene: Scene): RoomPoint {
  const [x, y] = applyMatrixToPoint(resolveWorldMatrix(cabinet, componentsById(scene.components)), point.x, point.y, 0)
  return { x, y }
}

function verticalExtent(cabinet: CarcaseComponent, scene: Scene, x0: number, x1: number,
  y0: number, y1: number, z0: number, z1: number): { z0: number; z1: number } {
  const matrix = resolveWorldMatrix(cabinet, componentsById(scene.components))
  const zs = [z0, z1].flatMap((z) => corners(x0, x1, y0, y1)
    .map((p) => applyMatrixToPoint(matrix, p.x, p.y, z)[2]))
  return { z0: Math.min(...zs), z1: Math.max(...zs) }
}

function cabinetHeight(cabinet: CarcaseComponent, scene: Scene): { z0: number; z1: number } {
  const b = carcaseBounds(cabinet.params, roleThicknessFor(cabinet.params, scene.materials, new Map()))
  return verticalExtent(cabinet, scene, b.x0, b.x1, b.y0, b.y1, b.z0, b.z1)
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
  // A short entered reach must never shrink the envelope below the leaf's stated width.
  const radius = Math.max(door.width, door.swing.radius)
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
    const resolved = resolveCarcase(cabinet, scene.parts, scene.materials)
    const fronts = operableFronts(cabinet.params.section, cabinet.params.frame)
    if (!resolved && fronts.length) {
      issues.push(`${cabinet.label}: front clearances cannot be assessed until cabinet geometry resolves`)
      continue
    }
    const cells = resolved ? frontCells(cabinet.params.section, resolved.tree,
      frontGeometryOf(cabinet.params, resolved.tree)) : []
    for (const front of fronts) {
      const assumption = room.clearances?.find((c) => c.cabinetId === cabinet.id && c.sectionId === front.sectionId)
      if (!assumption) {
        issues.push(`${cabinet.label}: ${front.kind} ${front.sectionId} has no stated clearance projection`)
        continue
      }
      const matching = cells.filter((cell) => cell.openingId === front.sectionId)
      if (!matching.length) {
        issues.push(`${cabinet.label}: ${front.kind} ${front.sectionId} has no resolved physical opening`)
        continue
      }
      const rect = { x0: Math.min(...matching.map((cell) => cell.rect.x0)),
        x1: Math.max(...matching.map((cell) => cell.rect.x1)),
        z0: Math.min(...matching.map((cell) => cell.rect.z0)),
        z1: Math.max(...matching.map((cell) => cell.rect.z1)) }
      const face = carcaseBounds(cabinet.params, roleThicknessFor(cabinet.params, scene.materials, new Map())).y0
      const envelope = corners(rect.x0, rect.x1, face - assumption.projection, face)
        .map((point) => placed(point, cabinet, scene))
      const { z0, z1 } = verticalExtent(cabinet, scene, rect.x0, rect.x1,
        face - assumption.projection, face, rect.z0, rect.z1)
      for (const obstacle of room.obstacles) {
        if (z0 >= obstacle.height || z1 <= 0) continue
        const shape = corners(obstacle.position.x, obstacle.position.x + obstacle.width,
          obstacle.position.y, obstacle.position.y + obstacle.depth).map((point) => roomPoint(point, room))
        if (overlaps(envelope, shape))
          issues.push(`${cabinet.label}: ${front.kind} ${front.sectionId} may be blocked by ${obstacle.name}`)
      }
      for (const other of cabinets) {
        if (other.id === cabinet.id) continue
        const bounds = cabinetHeight(other, scene)
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
    if (door.swing.radius < door.width)
      issues.push(`Room door ${door.id}: stated swing reach is shorter than door width; using door width conservatively`)
    const swing = doorSwingEnvelope(room, door)
    if (!swing) continue
    for (const cabinet of cabinets) {
      const b = cabinetHeight(cabinet, scene)
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

export interface ElevationSpan { id: string; kind: 'opening' | 'cabinet'; label: string; x0: number; x1: number; z0: number; z1: number }

export function wallElevation(room: RoomGeometry, wall: WallSegment, scene: Scene, cabinetIds: ReadonlySet<string>): ElevationSpan[] {
  const length = wallLength(wall)
  if (length === 0) return []
  const a = roomPoint(wall.start, room)
  const b = roomPoint(wall.end, room)
  const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  const spans: ElevationSpan[] = room.openings.filter((o) => o.wallId === wall.id).map((o) => ({
    id: o.id, kind: 'opening' as const, label: `${o.kind} ${Math.round(o.width)} × ${Math.round(o.height)}`,
    x0: o.offset, x1: o.offset + o.width, z0: o.sill, z1: o.sill + o.height,
  }))
  for (const placement of room.placements.filter((p) => p.wallId === wall.id && cabinetIds.has(p.cabinetId))) {
    const cabinet = scene.components.find((c): c is CarcaseComponent => c.id === placement.cabinetId && c.kind === 'carcase')
    if (!cabinet) continue
    const projected = footprint(cabinet, scene).map((point) => (point.x - a.x) * tangent.x + (point.y - a.y) * tangent.y)
    const bounds = cabinetHeight(cabinet, scene)
    spans.push({ id: cabinet.id, kind: 'cabinet', label: cabinet.label,
      x0: Math.min(...projected), x1: Math.max(...projected), z0: bounds.z0, z1: bounds.z1 })
  }
  return spans
}
