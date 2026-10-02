import { describe, expect, it } from 'vitest'
import { clearanceIssues, doorSwingEnvelope, wallElevation } from './roomAssessment'
import { defaultProject, emptyRoomGeometry, reconcileProject, type RoomGeometry } from './projectStructure'
import { CARCASE_PRESETS, DEFAULT_FRAME, PRESET_MATERIALS } from './carcasePresets'
import { setFrontOn } from './sectionInterior'
import type { CarcaseComponent, Scene } from './types'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'

const cabinet = (id: string, x = 0, rotation = 0): CarcaseComponent => {
  const params = CARCASE_PRESETS[0].params
  return { kind: 'carcase', id, label: id, parentId: null, visible: true,
    position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: rotation }, rotationOrder: 'XYZ',
    params: { ...params, section: setFrontOn(params.section, params.section.id,
      { kind: 'door', leaves: 1, hinge: 'left' }) },
  }
}
const scene = (components: CarcaseComponent[]): Scene => ({
  parts: [], materials: PRESET_MATERIALS, hardware: [], joints: [], components,
})

describe('room assessment', () => {
  it('does not claim an unmeasured door or drawer clears an obstruction', () => {
    const c = cabinet('door')
    const room: RoomGeometry = { ...emptyRoomGeometry(), obstacles: [{ id: 'island', name: 'Island',
      position: { x: 100, y: -500 }, width: 400, depth: 250, height: 900 }] }
    expect(clearanceIssues(room, scene([c]), new Set([c.id]))).toContain(
      `${c.label}: door ${c.params.section.id} has no stated clearance projection`)
    room.clearances = [{ cabinetId: c.id, sectionId: c.params.section.id, kind: 'door', projection: 600 }]
    expect(clearanceIssues(room, scene([c]), new Set([c.id]))).toContain(
      `${c.label}: door ${c.params.section.id} may be blocked by Island`)
    room.clearances[0].projection = 100
    expect(clearanceIssues(room, scene([c]), new Set([c.id]))).not.toContain(
      `${c.label}: door ${c.params.section.id} may be blocked by Island`)
  })

  it('checks rotated cabinet fronts and avoids a neighbouring room cabinet', () => {
    const c = cabinet('turned', 0, 90)
    const outside = cabinet('other', 400)
    const room = { ...emptyRoomGeometry(), clearances: [{ cabinetId: c.id, sectionId: c.params.section.id,
      kind: 'door' as const, projection: 600 }], obstacles: [{ id: 'post', name: 'Post',
      position: { x: 350, y: 100 }, width: 200, depth: 200, height: 2400 }] }
    const warnings = clearanceIssues(room, scene([c, outside]), new Set([c.id]))
    expect(warnings.some((warning) => warning.includes('Post'))).toBe(true)
    expect(warnings.some((warning) => warning.includes('other'))).toBe(false)
  })

  it('uses an explicit drawer extension and its opening height for obstruction checks', () => {
    const door = cabinet('drawer')
    const drawer = { ...door, params: { ...door.params,
      section: setFrontOn(door.params.section, door.params.section.id, { kind: 'drawer-front' }) } }
    const room: RoomGeometry = { ...emptyRoomGeometry(), obstacles: [{ id: 'island', name: 'Island',
      position: { x: 100, y: -500 }, width: 300, depth: 200, height: 900 }],
      clearances: [{ cabinetId: drawer.id, sectionId: drawer.params.section.id, kind: 'drawer', projection: 600 }],
    }
    expect(clearanceIssues(room, scene([drawer]), new Set([drawer.id]))).toContain(
      `${drawer.label}: drawer ${drawer.params.section.id} may be blocked by Island`)
    room.obstacles[0].height = 0
    expect(clearanceIssues(room, scene([drawer]), new Set([drawer.id]))).not.toContain(
      `${drawer.label}: drawer ${drawer.params.section.id} may be blocked by Island`)
  })

  it('projects a two-wall room opening and wall-linked cabinet into a dimensioned elevation', () => {
    const c = cabinet('kitchen')
    const room = { ...emptyRoomGeometry(), walls: [
      { id: 'long', name: 'Kitchen', start: { x: 0, y: 0 }, end: { x: 3983, y: 0 } },
      { id: 'return', name: 'Return', start: { x: 3983, y: 0 }, end: { x: 3983, y: 2400 } },
    ], openings: [{ id: 'window', wallId: 'long', kind: 'window' as const, offset: 800,
      width: 1200, sill: 900, height: 1100 }], placements: [{ cabinetId: c.id, wallId: 'long',
      offset: 0, setback: 0, manualOffset: { x: 0, y: 0 } }] }
    const spans = wallElevation(room, room.walls[0], scene([c]), new Set([c.id]))
    expect(spans.find((span) => span.id === 'window')).toMatchObject({ x0: 800, x1: 2000, z0: 900, z1: 2000 })
    expect(spans.find((span) => span.id === 'kitchen')?.x1).toBeCloseTo(c.params.width)
    expect(spans.find((span) => span.id === 'window')?.kind).toBe('opening')
    expect(spans.find((span) => span.id === 'kitchen')?.kind).toBe('cabinet')
    expect(wallElevation(room, room.walls[1], scene([c]), new Set([c.id]))).toEqual([])
  })

  it('round-trips signed site levels and explicit clearance assumptions, rejecting mismatched fronts', () => {
    const c = cabinet('cabinet')
    const geometry: RoomGeometry = { ...emptyRoomGeometry(), datum: 'Project ±0',
      siteLevels: [{ id: 'level-a', name: 'Floor corner', at: { x: 200, y: 300 },
        elevation: { value: -12, source: 'Site laser', recordedAt: '2026-09-29T10:00:00Z', uncertainty: 2 } }],
      clearances: [{ cabinetId: c.id, sectionId: c.params.section.id, kind: 'door', projection: 600 }],
    }
    const envelope = { version: FILE_FORMAT_VERSION, name: 'Kitchen', appVersion: '0', units: 'mm',
      createdAt: '2026-09-29', updatedAt: '2026-09-29',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: scene([c]), project: { id: 'project', areas: [{ id: 'area', name: 'Area', rooms: [{
        id: 'room', name: 'Room', geometry, items: [{ id: 'item', name: 'Item', rootComponentIds: [c.id], rootPartIds: [] }],
      }] }] },
    }
    const loaded = parseFile(JSON.stringify(envelope))
    expect(loaded.project?.areas[0].rooms[0].geometry?.siteLevels?.[0].elevation.value).toBe(-12)
    expect(loaded.project?.areas[0].rooms[0].geometry?.clearances?.[0].projection).toBe(600)
    geometry.clearances![0].kind = 'drawer'
    expect(() => parseFile(JSON.stringify(envelope))).toThrow(/matching door or drawer/)
    geometry.clearances![0].kind = 'door'
    geometry.datum = ''
    expect(() => parseFile(JSON.stringify(envelope))).toThrow(/datum/)
  })

  it('keeps an unassessed room door visible and checks an explicit swing side', () => {
    const room: RoomGeometry = { ...emptyRoomGeometry(), walls: [{ id: 'wall', name: 'Entry',
      start: { x: 0, y: 0 }, end: { x: 3000, y: 0 } }], openings: [{ id: 'entry', wallId: 'wall',
      kind: 'door', offset: 500, width: 900, sill: 0, height: 2100 }], obstacles: [{
      id: 'post', name: 'Post', position: { x: 650, y: 300 }, width: 200, depth: 200, height: 2300,
    }] }
    expect(clearanceIssues(room, scene([]), new Set())).toContain('Room door entry: hinge side and swing reach not assessed')
    room.openings[0].swing = { hinge: 'start', side: 'left', radius: 900 }
    expect(clearanceIssues(room, scene([]), new Set())).toContain('Room door entry: swing may be blocked by Post')
    room.openings[0].swing.side = 'right'
    expect(clearanceIssues(room, scene([]), new Set())).not.toContain('Room door entry: swing may be blocked by Post')
    room.openings[0].swing = { hinge: 'start', side: 'left', radius: 100 }
    expect(doorSwingEnvelope(room, room.openings[0])?.[1].x).toBe(1400)
    expect(clearanceIssues(room, scene([]), new Set())).toContain(
      'Room door entry: stated swing reach is shorter than door width; using door width conservatively')
    expect(clearanceIssues(room, scene([]), new Set())).toContain('Room door entry: swing may be blocked by Post')
  })

  it('drops an obsolete clearance when its front is removed', () => {
    const c = cabinet('changing')
    const original = scene([c])
    const project = defaultProject(original, 'change')
    project.areas[0].rooms[0].geometry!.clearances = [{ cabinetId: c.id,
      sectionId: c.params.section.id, kind: 'door', projection: 600 }]
    const withoutFront = { ...c, params: { ...c.params,
      section: setFrontOn(c.params.section, c.params.section.id, undefined) } }
    expect(reconcileProject(project, scene([withoutFront])).areas[0].rooms[0].geometry?.clearances).toEqual([])
  })

  it('round-trips a nested cabinet assessment and uses its composed room position', () => {
    const child = { ...cabinet('nested'), parentId: 'group' }
    const group = { kind: 'group' as const, id: 'group', label: 'Kitchen group', parentId: null,
      visible: true, position: { x: 1500, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 90 },
      rotationOrder: 'XYZ' as const }
    const nestedScene: Scene = { ...scene([child]), components: [group, child] }
    const project = defaultProject(nestedScene, 'nested-clearance')
    const geometry = project.areas[0].rooms[0].geometry!
    geometry.clearances = [{ cabinetId: child.id, sectionId: child.params.section.id,
      kind: 'door', projection: 600 }]
    geometry.obstacles = [{ id: 'post', name: 'Post', position: { x: 1700, y: 100 },
      width: 150, depth: 200, height: 2000 }]
    const envelope = { version: FILE_FORMAT_VERSION, name: 'Nested kitchen', appVersion: '0', units: 'mm',
      createdAt: '2026-09-29', updatedAt: '2026-09-29',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: nestedScene, project }
    expect(parseFile(JSON.stringify(envelope)).project?.areas[0].rooms[0].geometry?.clearances).toEqual(geometry.clearances)
    expect(reconcileProject(project, nestedScene)).toBe(project)
    expect(clearanceIssues(geometry, nestedScene, new Set(['group', child.id]))).toContain(
      'nested: door ' + child.params.section.id + ' may be blocked by Post')
    group.position.z = 2500
    expect(clearanceIssues(geometry, nestedScene, new Set(['group', child.id])).some((issue) => issue.includes('Post'))).toBe(false)
    group.position.z = 0
    const moved = structuredClone(project)
    moved.areas[0].rooms[0].items[0].rootComponentIds = []
    expect(reconcileProject(moved, nestedScene).areas[0].rooms[0].geometry?.clearances).toEqual([])
  })

  it('assesses independent face-frame door and drawer openings by physical ID', () => {
    const base = cabinet('framed')
    const c: CarcaseComponent = { ...base, params: { ...base.params, frame: { ...DEFAULT_FRAME, layout: {
      [base.params.section.id]: { id: 'zones', size: { kind: 'equal' }, content: { kind: 'split',
        axis: 'horizontal', children: [
          { id: 'lower-door', size: { kind: 'equal' }, front: { kind: 'door', leaves: 1, hinge: 'left' },
            content: { kind: 'leaf' } },
          { id: 'upper-drawer', size: { kind: 'equal' }, front: { kind: 'drawer-front' },
            content: { kind: 'leaf' } },
        ] } },
    } } } }
    const s = scene([c])
    const project = defaultProject(s, 'frame-clearance')
    const room = project.areas[0].rooms[0].geometry!
    room.clearances = [{ cabinetId: c.id, sectionId: 'lower-door', kind: 'door', projection: 600 },
      { cabinetId: c.id, sectionId: 'upper-drawer', kind: 'drawer', projection: 600 }]
    room.obstacles = [{ id: 'short-post', name: 'Short post', position: { x: 100, y: -400 },
      width: 200, depth: 200, height: 300 }]
    const warnings = clearanceIssues(room, s, new Set([c.id]))
    expect(warnings).toContain('framed: door lower-door may be blocked by Short post')
    expect(warnings.some((issue) => issue.includes('upper-drawer') && issue.includes('Short post'))).toBe(false)
    const envelope = { version: FILE_FORMAT_VERSION, name: 'Frame kitchen', appVersion: '0', units: 'mm',
      createdAt: '2026-09-29', updatedAt: '2026-09-29',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }, scene: s, project }
    expect(parseFile(JSON.stringify(envelope)).project?.areas[0].rooms[0].geometry?.clearances).toEqual(room.clearances)
    expect(reconcileProject(project, s)).toBe(project)
  })
})
