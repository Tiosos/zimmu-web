import type { RoomGeometry, RoomPoint, WallPlacement, WallSegment } from './projectStructure'
import type { CarcaseComponent, Scene } from './types'
import { worldBoundsOf } from './carcaseWorldBounds'

export function roomPoint(point: RoomPoint, room: RoomGeometry): RoomPoint {
  const radians = room.rotation * Math.PI / 180
  return {
    x: room.origin.x + point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: room.origin.y + point.x * Math.sin(radians) + point.y * Math.cos(radians),
  }
}

export function wallLength(wall: WallSegment): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
}

export function wallPlacementPose(room: RoomGeometry, placement: WallPlacement): { position: RoomPoint; rotation: number } | null {
  const wall = room.walls.find((w) => w.id === placement.wallId)
  if (!wall) return null
  const length = wallLength(wall)
  if (length === 0) return null
  const tangent = { x: (wall.end.x - wall.start.x) / length, y: (wall.end.y - wall.start.y) / length }
  const local = {
    x: wall.start.x + tangent.x * (placement.offset + placement.manualOffset.x) - tangent.y * (placement.setback + placement.manualOffset.y),
    y: wall.start.y + tangent.y * (placement.offset + placement.manualOffset.x) + tangent.x * (placement.setback + placement.manualOffset.y),
  }
  return { position: roomPoint(local, room), rotation: room.rotation + Math.atan2(tangent.y, tangent.x) * 180 / Math.PI }
}

// A drawn length from hypot is a float, so an uncertainty of 0 would call 3983.0000001 a disagreement.
export const MIN_LENGTH_TOLERANCE_MM = 0.5

export function lengthVerified(drawn: number, measured: { value: number; uncertainty: number }): boolean {
  return Math.abs(drawn - measured.value) <= Math.max(measured.uncertainty, MIN_LENGTH_TOLERANCE_MM)
}

export function roomIssues(room: RoomGeometry): string[] {
  const issues: string[] = []
  for (const wall of room.walls) {
    const length = wallLength(wall)
    if (length === 0) { issues.push(`${wall.name}: wall must have length`); continue }
    if (!wall.measuredLength) issues.push(`${wall.name}: site length not verified`)
    else if (!lengthVerified(length, wall.measuredLength))
      issues.push(`${wall.name}: drawn length differs from measured length`)
    for (const opening of room.openings.filter((o) => o.wallId === wall.id)) {
      if (opening.offset + opening.width > length)
        issues.push(`${wall.name}: ${opening.kind} extends beyond wall`)
    }
    for (const placement of room.placements.filter((p) => p.wallId === wall.id)) {
      if (placement.offset > length) issues.push(`${wall.name}: cabinet placement extends beyond wall`)
    }
  }
  return issues
}

export function roomSceneIssues(room: RoomGeometry, scene: Scene, cabinetIds: ReadonlySet<string>): string[] {
  const issues = roomIssues(room)
  const cabinets = scene.components.filter((c): c is CarcaseComponent => c.kind === 'carcase' && cabinetIds.has(c.id))
  for (const obstacle of room.obstacles) {
    const corners = [obstacle.position,
      { x: obstacle.position.x + obstacle.width, y: obstacle.position.y },
      { x: obstacle.position.x + obstacle.width, y: obstacle.position.y + obstacle.depth },
      { x: obstacle.position.x, y: obstacle.position.y + obstacle.depth },
    ].map((point) => roomPoint(point, room))
    const x0 = Math.min(...corners.map((point) => point.x))
    const x1 = Math.max(...corners.map((point) => point.x))
    const y0 = Math.min(...corners.map((point) => point.y))
    const y1 = Math.max(...corners.map((point) => point.y))
    for (const cabinet of cabinets) {
      const bounds = worldBoundsOf(cabinet, scene.materials)
      if (bounds.x0 < x1 && bounds.x1 > x0 && bounds.y0 < y1 && bounds.y1 > y0 &&
          bounds.z0 < obstacle.height && bounds.z1 > 0)
        issues.push(`${cabinet.label}: possible footprint overlap with ${obstacle.name}`)
    }
  }
  return issues
}
