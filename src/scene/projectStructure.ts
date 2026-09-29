import type { FaceFrameParams, FrameZone, Scene } from './types'
import type { Section, FrontSpec } from './sectionTree'
import { descendantIds } from './componentTree'

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

export interface SiteLevel {
  id: string
  name: string
  at: RoomPoint
  elevation: SiteMeasurement // signed millimetres relative to the project's stated datum
}

export interface FrontClearance {
  cabinetId: string
  sectionId: string
  kind: 'door' | 'drawer'
  projection: number // designer-entered travel/swing envelope in mm, not a generated hardware claim
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
  swing?: { hinge: 'start' | 'end'; side: 'left' | 'right'; radius: number }
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
  datum?: string
  siteLevels?: SiteLevel[]
  clearances?: FrontClearance[]
}

export function emptyRoomGeometry(): RoomGeometry {
  return { origin: { x: 0, y: 0 }, rotation: 0, walls: [], openings: [], obstacles: [], placements: [] }
}

export function roomComponentIds(rootIds: Iterable<string>, scene: Scene): Set<string> {
  const ids = new Set<string>()
  for (const rootId of rootIds) {
    ids.add(rootId)
    for (const id of descendantIds(rootId, scene.components, scene.parts).componentIds) ids.add(id)
  }
  return ids
}

function zoneFronts(zone: FrameZone): { sectionId: string; front: FrontSpec }[] {
  if (zone.content.kind === 'split') return zone.content.children.flatMap(zoneFronts)
  return zone.front ? [{ sectionId: zone.id, front: zone.front }] : []
}

function physicalFronts(section: Section, frame?: FaceFrameParams): { sectionId: string; front: FrontSpec }[] {
  if (section.content.kind === 'split') return section.content.children.flatMap((child) => physicalFronts(child, frame))
  const layout = frame?.layout?.[section.id]
  if (layout) return zoneFronts(layout)
  return section.front ? [{ sectionId: section.id, front: section.front }] : []
}

// sectionId stores the physical opening ID for independent face-frame fronts; for a
// structural front, the physical opening ID and section ID are the same.
export function frontForSection(section: Section, id: string, frame?: FaceFrameParams): FrontSpec | undefined {
  return physicalFronts(section, frame).find((entry) => entry.sectionId === id)?.front
}

export function operableFronts(section: Section, frame?: FaceFrameParams): { sectionId: string; kind: 'door' | 'drawer' }[] {
  return physicalFronts(section, frame).flatMap(({ sectionId, front }): { sectionId: string; kind: 'door' | 'drawer' }[] =>
    front.kind === 'door' ? [{ sectionId, kind: 'door' }] :
      front.kind === 'drawer-front' ? [{ sectionId, kind: 'drawer' }] : [])
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
      const roomComponents = roomComponentIds(roomRoots, scene)
      const placements = room.geometry?.placements.filter((p) => roomRoots.has(p.cabinetId) && live.has(p.cabinetId))
      if (placements && placements.length !== room.geometry!.placements.length) changed = true
      const clearances = room.geometry?.clearances?.filter((clearance) => {
        if (!roomComponents.has(clearance.cabinetId)) return false
        const cabinet = scene.components.find((c) => c.id === clearance.cabinetId)
        if (cabinet?.kind !== 'carcase') return false
        const front = frontForSection(cabinet.params.section, clearance.sectionId, cabinet.params.frame)
        return front?.kind === (clearance.kind === 'drawer' ? 'drawer-front' : 'door')
      })
      if (clearances && clearances.length !== room.geometry!.clearances!.length) changed = true
      return { ...room, items, ...(room.geometry ? { geometry: { ...room.geometry, placements: placements!,
        ...(clearances ? { clearances } : {}) } } : {}) }
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
