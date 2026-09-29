import { describe, expect, it } from 'vitest'
import { emptyRoomGeometry, type WallSegment } from './projectStructure'
import { roomIssues, roomPoint, wallLength, wallPlacementPose } from './roomGeometry'
import { parseFile } from './useFile'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { roomSceneIssues } from './roomGeometry'

const wall: WallSegment = { id: 'wall-a', name: 'Kitchen wall', start: { x: 0, y: 0 }, end: { x: 3983, y: 0 } }

describe('room geometry', () => {
  it('keeps design dimensions distinct from an uncertain site measurement', () => {
    const room = { ...emptyRoomGeometry(), walls: [{ ...wall, measuredLength: {
      value: 3978, uncertainty: 10, source: 'Site tape', recordedAt: '2026-09-29',
    } }] }
    expect(wallLength(wall)).toBe(3983)
    expect(roomIssues(room)).toEqual([])
    room.walls[0].measuredLength.uncertainty = 2
    expect(roomIssues(room)).toContain('Kitchen wall: drawn length differs from measured length')
  })

  it('transforms a two-wall return in the room local frame and reports opening overflow', () => {
    const room = { ...emptyRoomGeometry(), origin: { x: 100, y: 200 }, rotation: 90,
      walls: [wall, { ...wall, id: 'wall-b', start: wall.end, end: { x: 3983, y: 2400 } }],
      openings: [{ id: 'door', wallId: 'wall-b', kind: 'door' as const, offset: 2000, width: 900, sill: 0, height: 2100 }],
    }
    expect(roomPoint({ x: 3983, y: 0 }, room).x).toBeCloseTo(100)
    expect(roomPoint({ x: 3983, y: 0 }, room).y).toBeCloseTo(4183)
    expect(roomIssues(room)).toContain('Kitchen wall: door extends beyond wall')
    const pose = wallPlacementPose(room, { cabinetId: 'cabinet', wallId: 'wall-b', offset: 500,
      setback: 200, manualOffset: { x: 20, y: 10 } })!
    expect(pose.position.x).toBeCloseTo(-420)
    expect(pose.position.y).toBeCloseTo(3973)
    expect(pose.rotation).toBeCloseTo(180)
  })

  it('validates room references on open while accepting a v21 room without geometry', () => {
    const base = { version: 21, name: 'Kitchen', units: 'mm', appVersion: '0', createdAt: '2026-01-01', updatedAt: '2026-01-01',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: { parts: [], materials: {}, hardware: [], joints: [], components: [] },
      project: { id: 'project', areas: [{ id: 'area', name: 'Area', rooms: [{ id: 'room', name: 'Room',
        items: [{ id: 'item', name: 'Kitchen', rootComponentIds: [], rootPartIds: [] }],
      }] }] },
    }
    expect(parseFile(JSON.stringify(base)).project?.areas[0].rooms[0].geometry).toBeUndefined()
    const withWall = structuredClone(base)
    Object.assign(withWall.project.areas[0].rooms[0], { geometry: { ...emptyRoomGeometry(), walls: [wall],
      openings: [{ id: 'door', wallId: 'missing', kind: 'door', offset: 0, width: 800, sill: 0, height: 2100 }] } })
    expect(() => parseFile(JSON.stringify(withWall))).toThrow(/wallId/)
    Object.assign(withWall.project.areas[0].rooms[0], { geometry: { ...emptyRoomGeometry(), walls: [wall] } })
    expect(parseFile(JSON.stringify({ ...withWall, version: 22 })).project?.areas[0].rooms[0].geometry?.walls[0].end.x).toBe(3983)
    Object.assign(withWall.project.areas[0].rooms[0], { geometry: { ...emptyRoomGeometry(), walls: [{ ...wall,
      measuredLength: { value: 3983, source: '', recordedAt: '2026-09-29', uncertainty: 0 },
    }] } })
    expect(() => parseFile(JSON.stringify(withWall))).toThrow(/measurement source/)
  })

  it('flags a cabinet footprint overlapping a site obstacle', () => {
    const room = { ...emptyRoomGeometry(), obstacles: [{ id: 'column', name: 'Column',
      position: { x: 100, y: 100 }, width: 300, depth: 300, height: 2400 }] }
    const scene = { parts: [], materials: PRESET_MATERIALS, hardware: [], joints: [], components: [{
      kind: 'carcase' as const, id: 'cabinet', label: 'Base 600', parentId: null,
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ' as const,
      visible: true, params: CARCASE_PRESETS[0].params,
    }] }
    expect(roomSceneIssues(room, scene, new Set(['cabinet']))).toContain('Base 600: possible footprint overlap with Column')
  })
})
