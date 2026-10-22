import { expect, it } from 'vitest'
import { motionScene } from './__fixtures__/motion'
import {
  openingTargets,
  defaultOpeningSetting,
  openingMatrices,
  targetMotion,
  motionPartBox,
  previewOpeningSettings,
  acceptOpeningSettings,
  checkOpeningPaths,
  openingSettingIssue,
} from './openingMotion'
import { defaultOpeningMotion, openingMotionError, type OpeningMotion } from './openingMotionRecipe'
import { defaultProject, emptyRoomGeometry } from './projectStructure'
import { applyMatrixToPoint, resolveWorldMatrix } from '../geom/transform'
import { applyPipeline } from './pipeline'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import { validateCurrentFile, validateLegacyFileInput } from './fileValidation'
import { manufacturingParts } from './manufacturingPart'
import type { BoardPart, CarcaseComponent, Scene, ZimmuFile } from './types'
const fixture = (kind: 'door' | 'pair' | 'drawer' = 'door') => {
  const scene = motionScene(kind),
    project = defaultProject(scene, 'Motion'),
    targets = openingTargets(scene)
  const settings: OpeningMotion = {
    ...defaultOpeningMotion(),
    clearance: 0,
    entries: targets.map(defaultOpeningSetting),
  }
  return { scene, project, targets, settings }
}
const obstacle = (scene: Scene, x = 300, y = -300): BoardPart => {
  const p: BoardPart = {
    kind: 'board',
    id: 'obstruction',
    label: 'Obstacle board',
    length: 10,
    width: 10,
    thickness: 700,
    material: '',
    grain: 'free',
    position: { x, y, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    parentId: null,
    cuts: [],
    visible: true,
    driven: false,
    color: '#aaa',
  }
  scene.parts.push(p)
  return p
}
it('opens the left leaf outwards about its actual hinge edge without mutating the scene', () => {
  const f = fixture(),
    t = f.targets[0],
    before = JSON.stringify(f.scene),
    e = f.settings.entries[0]
  const point = applyMatrixToPoint(targetMotion(t, e, 1), t.box.x1, t.box.y1, t.box.z0)
  expect(point[0]).toBeCloseTo(t.box.x0)
  expect(point[1]).toBeCloseTo(-(t.box.x1 - t.box.x0) + t.box.y1)
  expect(point[2]).toBeCloseTo(t.box.z0)
  const matrices = openingMatrices(f.scene, f.settings, { [t.id]: 1 })
  const b = motionPartBox(t.part, matrices.get(t.id)!)
  expect(b.x1 - b.x0).toBeCloseTo(t.part.thickness)
  expect(b.y0).toBeCloseTo(-598)
  expect(JSON.stringify(f.scene)).toBe(before)
})
it('handles paired leaves independently and opens the right leaf in the opposite direction', () => {
  const f = fixture('pair'),
    [left, right] = f.targets
  expect(left.hinge).toBe('left')
  expect(right.hinge).toBe('right')
  const p = applyMatrixToPoint(
    targetMotion(right, f.settings.entries[1], 1),
    right.box.x0,
    right.box.y1,
    0,
  )
  expect(p[0]).toBeCloseTo(right.box.x1)
  expect(p[1]).toBeCloseTo(-(right.box.x1 - right.box.x0))
  const matrices = openingMatrices(f.scene, f.settings, { [right.id]: 1 })
  expect(matrices.has(left.id)).toBe(false)
  expect(matrices.has(right.id)).toBe(true)
})
it('offsets the hinge pivot and preserves closed manufacturing matrices', () => {
  const f = fixture(),
    t = f.targets[0],
    e = { ...f.settings.entries[0], axisOffset: 10 }
  expect(applyMatrixToPoint(targetMotion(t, e, 1), t.box.x0, t.box.y1 + 10, 0)).toEqual([
    t.box.x0,
    t.box.y1 + 10,
    0,
  ])
  const closed = openingMatrices(f.scene, f.settings, { [t.id]: 0 }).get(t.id)!
  const expected = resolveWorldMatrix(t.part, new Map(f.scene.components.map((c) => [c.id, c])))
  Array.from(closed).forEach((n, i) => expect(n).toBeCloseTo(expected[i]))
  const before = manufacturingParts(f.scene.parts, f.scene.materials, f.scene.components)
  openingMatrices(f.scene, { ...f.settings, entries: [e] }, { [t.id]: 1 })
  expect(manufacturingParts(f.scene.parts, f.scene.materials, f.scene.components)).toEqual(before)
})
it('moves a complete drawer front and all five box panels by the same negative-Y travel', () => {
  const f = fixture('drawer'),
    t = f.targets[0]
  expect(t.issue).toBeUndefined()
  expect(t.partIds).toHaveLength(6)
  expect(t.maximumTravel).toBeGreaterThan(300)
  const matrices = openingMatrices(f.scene, f.settings, { [t.id]: 0.5 }),
    map = new Map(f.scene.components.map((c) => [c.id, c]))
  for (const id of t.partIds) {
    const p = f.scene.parts.find((p) => p.id === id)!,
      old = resolveWorldMatrix(p, map),
      next = matrices.get(id)!
    expect(next[12]).toBeCloseTo(old[12])
    expect(next[13]).toBeCloseTo(old[13] - t.maximumTravel / 2)
    expect(next[14]).toBeCloseTo(old[14])
  }
})
it('transforms motion correctly through rotated and translated containers', () => {
  const f = fixture('drawer'),
    c = f.scene.components.find((c) => c.kind === 'carcase')!
  c.parentId = 'group'
  f.scene.components.push({
    kind: 'group',
    id: 'group',
    label: 'Room',
    parentId: null,
    position: { x: 1000, y: 2000, z: 50 },
    rotation: { x: 0, y: 0, z: 90 },
    rotationOrder: 'XYZ',
    visible: true,
  })
  const t = openingTargets(f.scene)[0],
    m = openingMatrices(f.scene, f.settings, { [t.id]: 1 }).get(t.id)!,
    old = resolveWorldMatrix(t.part, new Map(f.scene.components.map((c) => [c.id, c])))
  expect(m[12] - old[12]).toBeCloseTo(t.maximumTravel)
  expect(m[13]).toBeCloseTo(old[13])
  expect(m[14]).toBeCloseTo(old[14])
})
it('diagnoses detached fronts, incomplete drawers and tilted cabinets', () => {
  const f = fixture()
  f.targets[0].part.driven = false
  expect(openingTargets(f.scene)[0].issue).toContain('Detached')
  expect(() => openingMatrices(f.scene, f.settings, { [f.targets[0].id]: 1 })).toThrow('Detached')
  const d = fixture('drawer'),
    box = d.scene.parts.find((p) => p.id === d.targets[0].partIds[1])!
  box.driven = false
  expect(openingTargets(d.scene)[0].issue).toContain('driven drawer')
  const tilted = fixture()
  tilted.scene.components[0].rotation.x = 10
  expect(openingTargets(tilted.scene)[0].issue).toContain('upright')
})
it('rejects excess drawer travel, changed front kinds and invalid progress', () => {
  const f = fixture('drawer'),
    t = f.targets[0]
  expect(
    openingSettingIssue(t, { ...f.settings.entries[0], limit: t.maximumTravel + 1 }),
  ).toContain('exceeds')
  expect(openingSettingIssue(t, { ...f.settings.entries[0], kind: 'door' })).toContain('kind')
  for (const fraction of [-0.01, 1.01, NaN])
    expect(() => targetMotion(t, f.settings.entries[0], fraction)).toThrow('fraction')
  expect(() => openingMatrices(f.scene, f.settings, { missing: 1 })).toThrow('missing')
})
it('saves only settings and rejects stale, no-op and forged previews', () => {
  const f = fixture(),
    p = previewOpeningSettings(f.scene, f.project, f.settings),
    next = acceptOpeningSettings(f.scene, f.project, p)!
  expect(p.errors).toEqual([])
  expect(next).not.toBeNull()
  expect(next.parts).toBe(f.scene.parts)
  expect(next.components).toBe(f.scene.components)
  expect(
    acceptOpeningSettings(next, f.project, previewOpeningSettings(next, f.project, f.settings)),
  ).toBeNull()
  f.project.areas[0].name = 'Changed'
  expect(acceptOpeningSettings(f.scene, f.project, p)).toBeNull()
  const forged = {
    ...previewOpeningSettings(f.scene, f.project, f.settings),
    settings: { ...f.settings, clearance: -1 },
    errors: [],
  }
  expect(acceptOpeningSettings(f.scene, f.project, forged)).toBeNull()
  f.settings.entries[0].limit = NaN
  expect(previewOpeningSettings(f.scene, f.project, f.settings).errors.join(' ')).toContain('angle')
})
it('keeps broken saved references repairable while refusing new missing targets', () => {
  const f = fixture(),
    missing = { frontId: 'gone', kind: 'door' as const, limit: 90, axisOffset: 0 }
  expect(
    previewOpeningSettings(f.scene, f.project, { ...f.settings, entries: [missing] }).errors.join(
      ' ',
    ),
  ).toContain('missing')
  f.scene.openingMotion = { ...f.settings, entries: [missing] }
  expect(
    previewOpeningSettings(f.scene, f.project, { ...f.scene.openingMotion, clearance: 3 }).errors,
  ).toEqual([])
  expect(
    previewOpeningSettings(f.scene, f.project, {
      ...f.scene.openingMotion,
      entries: [{ ...missing, limit: 100 }],
    }).errors.join(' '),
  ).toContain('missing')
})
it('finds intermediate collisions that neither closed nor fully open position reaches', () => {
  const f = fixture(),
    t = f.targets[0],
    o = obstacle(f.scene),
    result = checkOpeningPaths(f.scene, f.project, f.settings, [t.id])
  expect(result.errors).toEqual([])
  expect(result.steps).toBe(45)
  const hit = result.findings.find((r) => r.otherId === o.id)
  expect(hit).toBeDefined()
  expect(hit!.at).toBeGreaterThan(0)
  expect(hit!.at).toBeLessThan(1)
  const closed = motionPartBox(
      t.part,
      openingMatrices(f.scene, f.settings, { [t.id]: 0 }).get(t.id)!,
    ),
    opened = motionPartBox(t.part, openingMatrices(f.scene, f.settings, { [t.id]: 1 }).get(t.id)!)
  expect(closed.y0).toBeGreaterThan(-290)
  expect(opened.x1).toBeLessThan(300)
})
it('includes finishing/filler boards, clearance and conservative pull projection envelopes', () => {
  const f = fixture(),
    t = f.targets[0],
    o = obstacle(f.scene, 610, -10)
  o.label = 'Linked filler'
  o.width = 30
  expect(
    checkOpeningPaths(f.scene, f.project, f.settings, [t.id]).findings.some(
      (r) => r.otherId === o.id,
    ),
  ).toBe(false)
  expect(
    checkOpeningPaths(f.scene, f.project, { ...f.settings, clearance: 30 }, [t.id]).findings.some(
      (r) => r.otherId === o.id,
    ),
  ).toBe(true)
  const h = fixture()
  h.targets[0].part.frontPull = {
    kind: 'pull',
    orientation: 'vertical',
    mount: 'bore',
    boreDiameter: 5,
    boreDepth: 12,
    pitch: 96,
    placement: 'centre',
    horizontalInset: 50,
    verticalInset: 50,
  } as never
  const handle = obstacle(h.scene, -80, -300)
  expect(
    checkOpeningPaths(h.scene, h.project, { ...h.settings, pullProjection: 0 }, [
      h.targets[0].id,
    ]).findings.some((r) => r.otherId === handle.id),
  ).toBe(false)
  expect(
    checkOpeningPaths(h.scene, h.project, { ...h.settings, pullProjection: 100 }, [
      h.targets[0].id,
    ]).findings.some((r) => r.otherId === handle.id),
  ).toBe(true)
})
it('checks room walls and obstacles only for member cabinets', () => {
  const f = fixture(),
    r = f.project.areas[0].rooms[0]
  r.geometry = {
    ...emptyRoomGeometry(),
    walls: [
      { id: 'front', name: 'Front wall', start: { x: 200, y: -300 }, end: { x: 400, y: -300 } },
    ],
    obstacles: [
      {
        id: 'pipe',
        name: 'Pipe',
        position: { x: 300, y: -300 },
        width: 10,
        depth: 10,
        height: 700,
      },
    ],
  }
  const result = checkOpeningPaths(f.scene, f.project, f.settings, [f.targets[0].id])
  expect(result.findings.some((r) => r.otherId.startsWith('wall:'))).toBe(true)
  expect(result.findings.some((r) => r.otherLabel === 'Pipe')).toBe(true)
  r.items.forEach((i) => {
    i.rootComponentIds = []
  })
  expect(
    checkOpeningPaths(f.scene, f.project, f.settings, [f.targets[0].id]).findings.some(
      (r) => r.otherId.startsWith('wall:') || r.otherLabel === 'Pipe',
    ),
  ).toBe(false)
})
it('detects simultaneous drawer motion and keeps each assembly internally coherent', () => {
  const f = fixture('drawer'),
    second = structuredClone(
      f.scene.components.find((c) => c.kind === 'carcase')!,
    ) as CarcaseComponent
  second.id = 'second'
  second.rotation.z = 180
  second.position = { x: 600, y: -400, z: 0 }
  f.scene.components.push(second)
  f.scene = applyPipeline(f.scene)
  f.project = defaultProject(f.scene, 'Pair')
  const targets = openingTargets(f.scene)
  expect(targets).toHaveLength(2)
  f.settings.entries = targets.map(defaultOpeningSetting)
  const result = checkOpeningPaths(
    f.scene,
    f.project,
    f.settings,
    targets.map((t) => t.id),
  )
  expect(result.errors).toEqual([])
  expect(
    result.findings.some((r) =>
      targets.some((t) => t.id !== r.frontId && t.partIds.includes(r.otherId)),
    ),
  ).toBe(true)
  expect(
    result.findings.some((r) =>
      targets.find((t) => t.id === r.frontId)!.partIds.includes(r.otherId),
    ),
  ).toBe(false)
})
it('rejects empty, duplicate, excessive and unavailable path selections', () => {
  const f = fixture(),
    id = f.targets[0].id
  for (const ids of [[], [id, id], Array.from({ length: 51 }, (_, i) => String(i)), ['missing']])
    expect(checkOpeningPaths(f.scene, f.project, f.settings, ids).errors.length).toBeGreaterThan(0)
  expect(
    checkOpeningPaths(f.scene, f.project, { ...f.settings, clearance: -1 }, [id]).errors.join(' '),
  ).toContain('Clearance')
})
it('caps findings explicitly instead of claiming a complete collision assessment', () => {
  const f = fixture()
  for (let i = 0; i < 205; i++) {
    const p = obstacle(f.scene)
    p.id = `o${i}`
  }
  const result = checkOpeningPaths(f.scene, f.project, f.settings, [f.targets[0].id])
  expect(result.truncated).toBe(true)
  expect(result.findings).toHaveLength(200)
})
it('roundtrips settings in format 39 and validates both file boundaries', () => {
  const f = fixture()
  f.scene.openingMotion = f.settings
  const raw = {
    version: FILE_FORMAT_VERSION,
    name: 'Motion',
    appVersion: '0',
    units: 'mm',
    createdAt: '',
    updatedAt: '',
    scene: f.scene,
    project: f.project,
    camera: { position: { x: 0, y: 0, z: 1000 }, target: { x: 0, y: 0, z: 0 } },
  } as ZimmuFile
  expect(FILE_FORMAT_VERSION).toBe(42)
  expect(parseFile(JSON.stringify(raw)).scene.openingMotion).toEqual(f.settings)
  for (const validate of [validateCurrentFile, validateLegacyFileInput]) {
    const bad = structuredClone(raw)
    bad.scene.openingMotion!.entries[0].limit = -1
    expect(() => validate(bad)).toThrow('openingMotion')
  }
  const older = structuredClone(raw)
  older.version = 38
  delete older.scene.openingMotion
  expect(parseFile(JSON.stringify(older)).scene.openingMotion).toBeUndefined()
})
it.each([
  ['object', null],
  ['version', { ...defaultOpeningMotion(), version: 2 }],
  ['clearance', { ...defaultOpeningMotion(), clearance: NaN }],
  ['negative', { ...defaultOpeningMotion(), clearance: -1 }],
  ['projection', { ...defaultOpeningMotion(), pullProjection: 101 }],
  ['entries', { ...defaultOpeningMotion(), entries: null }],
  [
    'limit count',
    {
      ...defaultOpeningMotion(),
      entries: Array.from({ length: 201 }, (_, i) => ({
        frontId: String(i),
        kind: 'door',
        limit: 90,
        axisOffset: 0,
      })),
    },
  ],
  ...[
    { frontId: '' },
    { kind: 'bad' },
    { limit: 0 },
    { limit: 181 },
    { limit: NaN },
    { axisOffset: 101 },
    { axisOffset: NaN },
    { kind: 'drawer-front', limit: 3001 },
    { kind: 'drawer-front', axisOffset: 1 },
  ].map((change) => [
    'entry',
    {
      ...defaultOpeningMotion(),
      entries: [{ frontId: 'a', kind: 'door', limit: 90, axisOffset: 0, ...change }],
    },
  ]),
  [
    'duplicate',
    {
      ...defaultOpeningMotion(),
      entries: [
        { frontId: 'a', kind: 'door', limit: 90, axisOffset: 0 },
        { frontId: 'a', kind: 'door', limit: 90, axisOffset: 0 },
      ],
    },
  ],
] as [string, unknown][])('rejects invalid recipe %s', (_name, value) =>
  expect(openingMotionError(value)).not.toBeNull(),
)

it('rejects incomplete drawer boxes and states the selection cap before resolving targets', () => {
  const f = fixture('drawer'),
    t = f.targets[0]
  f.scene.parts = f.scene.parts.filter((p) => p.id !== t.partIds[1])
  expect(openingTargets(f.scene)[0].issue).toContain('complete driven')
  expect(() => openingMatrices(f.scene, f.settings, { [t.id]: 1 })).toThrow('complete driven')
  expect(
    checkOpeningPaths(
      f.scene,
      f.project,
      f.settings,
      Array.from({ length: 51 }, (_, i) => String(i)),
    ).errors[0],
  ).toContain('1–50')
})
it('treats reordered saved entries as a no-op and preserves unchanged unsupported settings for repair', () => {
  const f = fixture('pair')
  f.scene.openingMotion = structuredClone(f.settings)
  const reordered = { ...f.settings, entries: [...f.settings.entries].reverse() }
  expect(previewOpeningSettings(f.scene, f.project, reordered).changed).toBe(false)
  f.targets[0].part.driven = false
  expect(
    previewOpeningSettings(f.scene, f.project, { ...f.settings, clearance: 5 }).errors,
  ).toEqual([])
  const edited = structuredClone(f.settings)
  edited.entries[0].limit = 100
  expect(previewOpeningSettings(f.scene, f.project, edited).errors.join(' ')).toContain('Detached')
})

it('inflates swept intervals to cover arc extrema between sampled endpoints', () => {
  const f = fixture(),
    t = f.targets[0],
    reach = Math.hypot(t.box.x1 - t.box.x0, t.box.y1 - t.box.y0)
  const p = obstacle(f.scene, t.box.x0 - 0.0005, t.box.y1 - reach - 0.0005)
  p.length = 0.001
  p.width = 0.001
  p.thickness = 10
  p.position.z = 100
  expect(
    checkOpeningPaths(f.scene, f.project, f.settings, [t.id]).findings.some(
      (f) => f.otherId === p.id,
    ),
  ).toBe(true)
})
