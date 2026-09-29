import type { Scene } from './types'

export interface JoineryItem {
  id: string
  name: string
  jid?: string
  cutlistNumber?: string
  rootComponentIds: string[]
  rootPartIds: string[]
}

export interface ProjectRoom {
  id: string
  name: string
  items: JoineryItem[]
  geometry?: RoomGeometry
}

export interface SiteMeasurement {
  value: number
  source: string
  recordedAt: string
  uncertainty: number
}

export interface RoomPoint { x: number; y: number }

export interface WallSegment {
  id: string
  name: string
  start: RoomPoint
  end: RoomPoint
  measuredLength?: SiteMeasurement
}

export interface WallOpening {
  id: string
  wallId: string
  kind: 'door' | 'window'
  offset: number
  width: number
  sill: number
  height: number
}

export interface RoomObstacle {
  id: string
  name: string
  position: RoomPoint
  width: number
  depth: number
  height: number
}

export interface WallPlacement {
  cabinetId: string
  wallId: string
  offset: number
  setback: number
  manualOffset: RoomPoint
}

export interface RoomGeometry {
  origin: RoomPoint
  rotation: number
  walls: WallSegment[]
  openings: WallOpening[]
  obstacles: RoomObstacle[]
  placements: WallPlacement[]
}

export function emptyRoomGeometry(): RoomGeometry {
  return { origin: { x: 0, y: 0 }, rotation: 0, walls: [], openings: [], obstacles: [], placements: [] }
}

export interface ProjectArea {
  id: string
  name: string
  rooms: ProjectRoom[]
}

export interface ProjectStructure {
  id: string
  areas: ProjectArea[]
}

// Stable on repeated reads of the same legacy file; the IDs become persistent on first save.
// This is identity for migration, not a content checksum or release identifier.
function legacyKey(source: string): string {
  let forward = 0xcbf29ce484222325n
  let reverse = 0x84222325cbf29ce4n
  const mask = (1n << 64n) - 1n
  for (let i = 0; i < source.length; i++) {
    forward = ((forward ^ BigInt(source.charCodeAt(i))) * 0x100000001b3n) & mask
    reverse = ((reverse ^ BigInt(source.charCodeAt(source.length - i - 1))) * 0x100000001b3n) & mask
  }
  return forward.toString(16).padStart(16, '0') + reverse.toString(16).padStart(16, '0')
}

export function defaultProject(scene: Scene, seed?: string): ProjectStructure {
  const key = seed === undefined ? crypto.randomUUID() : `legacy_${legacyKey(seed)}`
  return {
    id: `project_${key}`,
    areas: [{
      id: `area_${key}`,
      name: 'Default Area',
      rooms: [{
        id: `room_${key}`,
        name: 'Default Room',
        geometry: emptyRoomGeometry(),
        items: [{
          id: `item_${key}`,
          name: 'Default Joinery Item',
          rootComponentIds: scene.components.filter((c) => c.parentId === null).map((c) => c.id),
          rootPartIds: scene.parts.filter((p) => p.parentId === null).map((p) => p.id),
        }],
      }],
    }],
  }
}

export function reconcileProject(project: ProjectStructure, scene: Scene, targetItemId?: string): ProjectStructure {
  const roots = scene.components.filter((c) => c.parentId === null).map((c) => c.id)
  const partRoots = scene.parts.filter((p) => p.parentId === null).map((p) => p.id)
  const live = new Set(roots)
  const liveParts = new Set(partRoots)
  const seen = new Set<string>()
  const seenParts = new Set<string>()
  let changed = false
  const areas = project.areas.map((area) => ({
    ...area,
    rooms: area.rooms.map((room) => {
      const items = room.items.map((item) => {
        const ids = item.rootComponentIds.filter((id) => {
          if (!live.has(id) || seen.has(id)) { changed = true; return false }
          seen.add(id)
          return true
        })
        const partIds = item.rootPartIds.filter((id) => {
          if (!liveParts.has(id) || seenParts.has(id)) { changed = true; return false }
          seenParts.add(id)
          return true
        })
        return ids.length === item.rootComponentIds.length && partIds.length === item.rootPartIds.length
          ? item : { ...item, rootComponentIds: ids, rootPartIds: partIds }
      })
      const roomRoots = new Set(items.flatMap((item) => item.rootComponentIds))
      const placements = room.geometry?.placements.filter((p) => roomRoots.has(p.cabinetId) && live.has(p.cabinetId))
      if (placements && placements.length !== room.geometry!.placements.length) changed = true
      return { ...room, items, ...(room.geometry ? { geometry: { ...room.geometry, placements: placements! } } : {}) }
    }),
  }))
  const unassigned = roots.filter((id) => !seen.has(id))
  const unassignedParts = partRoots.filter((id) => !seenParts.has(id))
  if (!changed && unassigned.length === 0 && unassignedParts.length === 0) return project
  const target = areas.flatMap((area) => area.rooms).flatMap((room) => room.items)
    .find((item) => item.id === targetItemId) ?? areas[0].rooms[0].items[0]
  const destination = areas.flatMap((area) => area.rooms).find((room) => room.items.some((item) => item.id === target.id))!
  destination.items = destination.items.map((item) => item.id === target.id
    ? { ...item, rootComponentIds: [...item.rootComponentIds, ...unassigned],
      rootPartIds: [...item.rootPartIds, ...unassignedParts] } : item)
  return { ...project, areas }
}

export function moveRootToItem(project: ProjectStructure, rootId: string, itemId: string, kind: 'component' | 'part' = 'component'): ProjectStructure {
  return {
    ...project,
    areas: project.areas.map((area) => ({
      ...area,
      rooms: area.rooms.map((room) => ({
        ...room,
        items: room.items.map((item) => ({
          ...item,
          rootComponentIds: kind === 'part' ? item.rootComponentIds : [
            ...item.rootComponentIds.filter((id) => id !== rootId),
            ...(item.id === itemId ? [rootId] : []),
          ],
          rootPartIds: kind === 'component' ? item.rootPartIds : [
            ...item.rootPartIds.filter((id) => id !== rootId),
            ...(item.id === itemId ? [rootId] : []),
          ],
        })),
      })),
    })),
  }
}
