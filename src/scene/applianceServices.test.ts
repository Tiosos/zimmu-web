import { describe, expect, it } from 'vitest'
import { motionScene } from './__fixtures__/motion'
import { interiorsScene } from './__fixtures__/interiors'
import { defaultApplianceBay, applianceBayError, applianceBaysError } from './applianceRecipe'
import {
  applianceOpenings,
  resolveAppliance,
  previewAppliance,
  acceptAppliance,
  copyAppliance,
} from './applianceBays'
import {
  defaultServiceFeature,
  serviceMachiningError,
  type ServiceMachining,
} from './serviceRecipe'
import {
  previewService,
  acceptService,
  resolveServices,
  serviceCutId,
  serviceCutOwned,
  serviceIssues,
} from './serviceMachining'
import { applyPipeline } from './pipeline'
import { defaultInterior } from './sectionInterior'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import { defaultProject } from './projectStructure'
import { validateCurrentFile } from './fileValidation'
import { previewFinishing, finishingDraft, acceptFinishing } from './finishingPanels'
import { componentsById } from './componentTree'
import { manufacturingPart } from './manufacturingPart'
import type { BoardPart, CarcaseComponent, Scene, ZimmuFile } from './types'
const cabinet = (s: Scene) =>
  s.components.find((c): c is CarcaseComponent => c.id === 'cab' && c.kind === 'carcase')!
const panel = (s: Scene, role = 'back') =>
  s.parts.find((p): p is BoardPart => p.kind === 'board' && p.role === role)!
function bay(s: Scene, id = 'appliance') {
  return defaultApplianceBay(id, 'cab', applianceOpenings(s, 'cab')[0].id)
}
function file(s: Scene): ZimmuFile {
  return {
    version: FILE_FORMAT_VERSION,
    name: 'Appliances',
    appVersion: '0',
    units: 'mm',
    createdAt: '2026-10-22',
    updatedAt: '2026-10-22',
    camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
    scene: s,
    project: defaultProject(s, 'appliance'),
  }
}
const recipe = (): ServiceMachining => ({ version: 1, features: [defaultServiceFeature('hole')] })
const service = (s: Scene, r = recipe(), targetId = panel(s).id) => {
  const p = previewService(s, 'cab', targetId, r)
  expect(p.errors).toEqual([])
  expect(p.scene).not.toBeNull()
  return p
}
describe('appliance bay fit and ownership', () => {
  it('resolves body, five clearances, mounting and reference positions without changing stock', () => {
    const s = motionScene(),
      b = {
        ...bay(s),
        left: 10,
        right: 20,
        top: 30,
        bottom: 5,
        rear: 40,
        elevation: 10,
        recess: 15,
        alignment: 'left' as const,
        offset: 7,
      }
    const before = structuredClone(s),
      r = resolveAppliance(s, b)
    expect(r.errors).toEqual([])
    expect(r.required).toEqual({ x: 330, y: 340, z: 235 })
    expect(r.envelope!.min).toEqual({
      x: r.opening!.min.x + 7,
      y: r.opening!.min.y + 15,
      z: r.opening!.min.z + 10,
    })
    expect(r.body!.min.x).toBe(r.envelope!.min.x + 10)
    expect(r.body!.min.z).toBe(r.envelope!.min.z + 5)
    expect(s).toEqual(before)
  })
  it('uses centre and right references and follows changing cabinet width', () => {
    const s = motionScene(),
      b = { ...bay(s), alignment: 'right' as const, offset: 10 }
    const r = resolveAppliance(s, b)
    expect(r.envelope!.max.x).toBe(r.opening!.max.x - 10)
    const centred = resolveAppliance(s, { ...b, alignment: 'centre', offset: 0 })
    expect(centred.body!.min.x + centred.body!.max.x).toBe(
      centred.opening!.min.x + centred.opening!.max.x,
    )
    cabinet(s).params.width += 100
    const after = resolveAppliance(applyPipeline(s), b)
    expect(after.body!.min.x).toBe(r.body!.min.x + 100)
  })
  it('uses smaller framed access openings and inset-front usable depth', () => {
    const plain = motionScene(),
      framed = motionScene('door', true)
    expect(applianceOpenings(framed, 'cab')[0].box.min.x).toBeGreaterThan(
      applianceOpenings(plain, 'cab')[0].box.min.x,
    )
    cabinet(plain).params.frontMount = 'inset'
    const opening = applianceOpenings(plain, 'cab')[0].box
    expect(opening.min.y).toBeGreaterThan(0)
    expect(resolveAppliance(plain, bay(plain)).available!.y).toBe(opening.max.y - opening.min.y)
    const paired = motionScene('pair', true)
    cabinet(paired).params.frame!.pairStile = true
    cabinet(paired).params.frontMount = 'inset'
    const pairOpenings = applianceOpenings(applyPipeline(paired), 'cab')
    expect(pairOpenings).toHaveLength(2)
    expect(pairOpenings.every((o) => o.box.min.y === 18)).toBe(true)
  })
  it('resolves independently divided frame access openings and reports lost zones', () => {
    const s = motionScene('door', true),
      c = cabinet(s)
    c.params.frame!.layout = {
      [c.params.section.id]: {
        id: 'frame-root',
        size: { kind: 'equal' },
        content: {
          kind: 'split',
          axis: 'vertical',
          children: ['zone-a', 'zone-b'].map((id) => ({
            id,
            size: { kind: 'equal' },
            content: { kind: 'leaf' },
          })),
        },
      },
    }
    const next = applyPipeline(s),
      openings = applianceOpenings(next, 'cab')
    expect(openings.map((o) => o.id)).toEqual(['zone-a', 'zone-b'])
    expect(openings[0].box.max.x).toBeLessThan(openings[1].box.min.x)
    const b = { ...bay(next), width: 150 }
    expect(resolveAppliance(next, b).errors).toEqual([])
    delete cabinet(next).params.frame!.layout
    expect(resolveAppliance(applyPipeline(next), b).errors.join()).toContain('opening')
  })
  it('reports width, height, depth and front-stock interference as visible planning issues', () => {
    const s = motionScene(),
      b = { ...bay(s), width: 1000, height: 1000, depth: 1000, recess: -10 }
    const p = previewAppliance(s, b)
    expect(p.errors).toEqual([])
    expect(p.resolved!.issues.join()).toMatch(/width/)
    expect(p.resolved!.issues.join()).toMatch(/height/)
    expect(p.resolved!.issues.join()).toMatch(/depth/)
    expect(p.resolved!.issues.join()).toMatch(/intersects/)
    const accepted = acceptAppliance(s, p)!
    expect(accepted.parts).toEqual(s.parts)
    expect(accepted.applianceBays).toEqual([b])
  })
  it('detects shelf, drawer, back and sibling reserved-space conflicts', () => {
    const s = motionScene('drawer'),
      b = { ...bay(s), width: 500, height: 500, depth: 550 }
    expect(resolveAppliance(s, b).issues.join()).toMatch(/Box/)
    const shelved = motionScene()
    cabinet(shelved).params.section.interior = defaultInterior(1)
    const resolved = applyPipeline(shelved)
    expect(resolveAppliance(resolved, { ...bay(resolved), height: 550 }).issues.join()).toMatch(
      /shelf/i,
    )
    const source = motionScene(),
      one = bay(source)
    source.applianceBays = [one]
    expect(resolveAppliance(source, bay(source, 'second')).issues.join()).toContain('appliance bay')
    expect(resolveAppliance(source, { ...bay(source), depth: 600 }).issues.join()).toMatch(/Back/)
  })
  it('keeps cabinet-local fit invariant under rotated cabinet/group placement', () => {
    const s = motionScene(),
      b = bay(s),
      before = resolveAppliance(s, b)
    const c = cabinet(s)
    c.rotation.z = 37
    c.parentId = 'g'
    s.components.push({
      kind: 'group',
      id: 'g',
      label: 'Room',
      parentId: null,
      visible: true,
      position: { x: 900, y: 20, z: 0 },
      rotation: { x: 0, y: 0, z: 90 },
      rotationOrder: 'XYZ',
    })
    expect(resolveAppliance(s, b).body).toEqual(before.body)
    expect(resolveAppliance(s, b).issues).toEqual(before.issues)
  })
  it('reports missing references, rejects malformed dimensions and bounds recipe counts', () => {
    const s = motionScene(),
      b = bay(s)
    expect(resolveAppliance(s, { ...b, cabinetId: 'gone' }).errors.join()).toMatch(/cabinet/)
    expect(resolveAppliance(s, { ...b, openingId: 'gone' }).errors.join()).toMatch(/opening/)
    for (const width of [0, -1, NaN, Infinity, 100001])
      expect(applianceBayError({ ...b, width })).not.toBeNull()
    expect(applianceBayError({ ...b, left: -1 })).not.toBeNull()
    expect(applianceBayError({ ...b, category: 'bad' })).not.toBeNull()
    expect(applianceBayError({ ...b, alignment: 'bad' })).not.toBeNull()
    expect(applianceBaysError([b, b])).toEqual(expect.stringMatching(/unique/))
    expect(applianceBaysError(Array(501).fill(b))).toMatch(/500/)
  })
  it('saves, edits, removes and copies specs with stable identities and fit checks', () => {
    const s = interiorsScene(true),
      b = { ...bay(s), width: 200 },
      one = acceptAppliance(s, previewAppliance(s, b))!
    const target = { ...b, id: 'copy', openingId: applianceOpenings(s, 'cab')[1].id }
    const copied = copyAppliance(one, b.id, target)
    expect(copied.id).toBe('copy')
    expect(copied.openingId).toBe(target.openingId)
    expect(copied.label).toContain('copy')
    const updated = acceptAppliance(
      one,
      previewAppliance(one, { ...b, label: 'Oven', width: 250 }),
    )!
    expect(updated.applianceBays).toHaveLength(1)
    expect(updated.applianceBays![0].id).toBe(b.id)
    const deleted = acceptAppliance(
      updated,
      previewAppliance(updated, updated.applianceBays![0], 'delete'),
    )!
    expect(deleted.applianceBays).toBeUndefined()
    const huge = { ...b, width: 1000 }
    one.applianceBays = [huge]
    expect(() => copyAppliance(one, huge.id, target)).toThrow(/cannot fit/)
  })
  it('rejects stale, unchanged, conflicting-ID and tampered proposals', () => {
    const s = motionScene(),
      b = bay(s),
      p = previewAppliance(s, b)
    const changed = structuredClone(s)
    cabinet(changed).params.width += 1
    expect(acceptAppliance(changed, p)).toBeNull()
    const one = acceptAppliance(s, p)!
    expect(acceptAppliance(one, previewAppliance(one, b))).toBeNull()
    expect(previewAppliance(one, { ...b, cabinetId: 'other' }).errors.join()).toContain(
      'another cabinet',
    )
    expect(acceptAppliance(s, { ...p, bay: { ...b, width: -1 } })).toBeNull()
    expect(acceptAppliance(s, { ...p, action: 'bad' as never })).toBeNull()
  })
})
describe('service cuts and linked regeneration', () => {
  it('emits real circular cuts with stable IDs, both faces and blind depths', () => {
    const s = motionScene(),
      r = recipe(),
      first = service(s, r)
    expect(first.rows[0].cut).toMatchObject({
      kind: 'hole-array',
      id: serviceCutId('hole', 0),
      face: '+Z',
      depth: panel(s).thickness,
    })
    const next = acceptService(s, first)!,
      b = panel(next)
    expect(serviceCutOwned(b, serviceCutId('hole', 0))).toBe(true)
    expect(panel(applyPipeline(next)).cuts).toEqual(b.cuts)
    const minus = service(next, {
      version: 1,
      features: [{ ...r.features[0], face: '-Z', mode: 'blind', depth: 3 }],
    })
    expect(minus.rows[0].cut).toMatchObject({ face: '-Z', start: { z: 0 }, depth: 3 })
  })
  it('supports rectangles, repeated slots, positions and exact minimum web', () => {
    const s = motionScene(),
      f = {
        ...defaultServiceFeature('slots', 'rectangle'),
        length: 80,
        width: 10,
        count: 3,
        pitch: 15,
        web: 5,
      }
    const p = service(s, { version: 1, features: [f] })
    expect(p.rows).toHaveLength(3)
    expect(p.rows.map((r) => r.y)).toEqual([
      panel(s).width / 2,
      panel(s).width / 2 + 15,
      panel(s).width / 2 + 30,
    ])
    expect(p.rows[0].cut.kind).toBe('box')
    expect(
      previewService(s, 'cab', panel(s).id, {
        version: 1,
        features: [{ ...f, pitch: 14 }],
      }).errors.join(),
    ).toMatch(/minimum/)
    const right = service(s, {
      version: 1,
      features: [
        {
          ...f,
          count: 1,
          xRef: 'right',
          x: 120,
          yRef: 'rear',
          y: 100,
          face: '-Z',
          mode: 'blind',
          depth: 3,
        },
      ],
    })
    expect(right.rows[0].x).toBe(panel(s).length - 120)
    expect(right.rows[0].y).toBe(panel(s).width - 100)
    expect(right.rows[0].cut).toMatchObject({ position: { z: 0 }, size: { z: 3 } })
  })
  it('rejects edge violations, invalid blind depth and repeat overflow', () => {
    const s = motionScene(),
      f = defaultServiceFeature('hole')
    expect(
      previewService(s, 'cab', panel(s).id, {
        version: 1,
        features: [{ ...f, xRef: 'left', x: 1 }],
      }).errors.join(),
    ).toMatch(/clearance/)
    expect(
      previewService(s, 'cab', panel(s).id, {
        version: 1,
        features: [{ ...f, mode: 'blind', depth: panel(s).thickness }],
      }).errors.join(),
    ).toMatch(/leave material/)
    expect(
      previewService(s, 'cab', panel(s).id, {
        version: 1,
        features: [{ ...f, count: 32, pitch: 1000 }],
      }).errors.join(),
    ).toMatch(/clearance/)
  })
  it('detects clashes with real existing box cuts and side-face bores', () => {
    const s = motionScene(),
      b = panel(s),
      f = defaultServiceFeature('hole')
    b.cuts.push({
      kind: 'box',
      id: 'manual',
      label: 'Existing pocket',
      face: '+Z',
      position: { x: b.length / 2 - 5, y: b.width / 2 - 5, z: 0 },
      size: { x: 10, y: 10, z: b.thickness },
    })
    expect(previewService(s, 'cab', b.id, { version: 1, features: [f] }).errors.join()).toContain(
      'existing machining',
    )
    b.cuts = [
      {
        kind: 'hole-array',
        id: 'bore',
        label: 'Side bore',
        face: '+X',
        axis: 'U',
        start: { x: b.length, y: b.width / 2, z: b.thickness / 2 },
        diameter: 5,
        count: 1,
        pitch: 0,
        depth: b.length,
      },
    ]
    expect(previewService(s, 'cab', b.id, recipe()).errors.join()).toContain('existing machining')
  })
  it('rejects nonpositive existing machining bounds', () => {
    const s = motionScene(),
      b = panel(s)
    b.cuts.push({
      kind: 'box',
      id: 'bad-box',
      label: 'Invalid box',
      face: '+Z',
      position: { x: 0, y: 0, z: 0 },
      size: { x: -1, y: 20, z: 2 },
    })
    expect(previewService(s, 'cab', b.id, recipe()).errors.join()).toContain('invalid dimensions')
  })
  it('bounds existing arrays and rejects mitred panels, while allowing recipe removal for repair', () => {
    const s = motionScene(),
      b = panel(s)
    b.cuts = [
      {
        kind: 'hole-array',
        id: 'huge',
        label: 'Huge',
        face: '+Z',
        axis: 'U',
        start: { x: 0, y: 0, z: b.thickness },
        diameter: 1,
        count: 5001,
        pitch: 1,
        depth: 1,
      },
    ]
    expect(previewService(s, 'cab', b.id, recipe()).errors.join()).toMatch(/limit/)
    if (b.cuts[0].kind === 'hole-array') b.cuts[0].count = 0
    expect(previewService(s, 'cab', b.id, recipe()).errors.join()).toContain('supported bounds')

    b.cuts = [{ kind: 'mitre', id: 'm', label: 'Mitre', end: '+X', axis: 'Z', angle: 45 }]
    expect(previewService(s, 'cab', b.id, recipe()).errors.join()).toMatch(/Mitred/)
    expect(resolveServices(s, b, { version: 1, features: [] })).toEqual([])
  })
  it('requires positive material after the combined service cuts', () => {
    const s = motionScene(),
      source = panel(s),
      p = {
        ...structuredClone(source),
        id: 'clean-panel',
        role: undefined,
        driven: false,
        cuts: [],
      }
    s.parts.push(p)
    const f = {
      ...defaultServiceFeature('half-a', 'rectangle'),
      length: p.length / 2,
      width: p.width,
      clearance: 0,
      web: 0,
      xRef: 'left' as const,
      x: p.length / 4,
    }
    const r: ServiceMachining = {
      version: 1,
      features: [f, { ...f, id: 'half-b', x: (3 * p.length) / 4 }],
    }
    expect(previewService(s, 'cab', p.id, r).errors.join()).toContain('positive panel material')
  })
  it('preserves unrelated cuts, follows resize, freezes invalid cuts and recovers', () => {
    let s = motionScene()
    const b = panel(s)
    b.cuts.push({
      kind: 'box',
      id: 'manual',
      label: 'Small corner recess',
      face: '+Z',
      position: { x: 5, y: 5, z: 0 },
      size: { x: 5, y: 5, z: 2 },
    })
    s = acceptService(s, service(s))!
    const before = panel(s).cuts.find((c) => c.id === serviceCutId('hole', 0))!
    cabinet(s).params.width += 100
    s = applyPipeline(s)
    const after = panel(s).cuts.find((c) => c.id === before.id)!
    expect(
      after.kind === 'hole-array' && before.kind === 'hole-array' && after.start.y - before.start.y,
    ).toBe(50)
    expect(panel(s).cuts.some((c) => c.id === 'manual')).toBe(true)
    const last = structuredClone(panel(s).cuts.filter((c) => c.id.startsWith('sm_')))
    panel(s).serviceMachining!.features[0].diameter = 10000
    s = applyPipeline(s)
    expect(panel(s).cuts.filter((c) => c.id.startsWith('sm_'))).toEqual(last)
    expect(serviceIssues(s, panel(s)).length).toBeGreaterThan(0)
    panel(s).serviceMachining!.features[0].diameter = 35
    s = applyPipeline(s)
    expect(serviceIssues(s, panel(s))).toEqual([])
  })
  it('retains service recipes on drawer/frame boards and linked finishing panels', () => {
    for (const s of [motionScene('drawer'), motionScene('door', true)]) {
      const b = s.parts.find(
        (p): p is BoardPart =>
          p.kind === 'board' && (p.role === 'box-bottom' || p.role === 'stile-left'),
      )!
      const f = { ...defaultServiceFeature('small'), diameter: 5, clearance: 2, web: 0 }
      const p = service(s, { version: 1, features: [f] }, b.id)
      expect(
        (applyPipeline(p.scene!).parts.find((x) => x.id === b.id) as BoardPart).serviceMachining,
      ).toEqual(p.recipe)
    }
    let s = motionScene()
    s = acceptFinishing(
      s,
      previewFinishing(s, 'cab', { ...finishingDraft(s, 'cab'), follow: true }),
      'finish',
    )!
    const p = service(s, recipe(), 'finish')
    expect(
      (applyPipeline(p.scene!).parts.find((p) => p.id === 'finish') as BoardPart).finishing,
    ).toBeTruthy()
  })
  it('validates bay associations and retains cuts when their saved bay disappears', () => {
    let s = motionScene()
    const b = bay(s)
    s = acceptAppliance(s, previewAppliance(s, b))!
    s = acceptService(
      s,
      service(s, { version: 1, features: [{ ...defaultServiceFeature('hole'), bayId: b.id }] }),
    )!
    const cuts = structuredClone(panel(s).cuts.filter((c) => c.id.startsWith('sm_')))
    s = acceptAppliance(s, previewAppliance(s, b, 'delete'))!
    s = applyPipeline(s)
    expect(panel(s).cuts.filter((c) => c.id.startsWith('sm_'))).toEqual(cuts)
    expect(serviceIssues(s, panel(s)).join()).toContain('no longer exists')
    expect(
      previewService(s, 'cab', panel(s).id, {
        version: 1,
        features: [{ ...defaultServiceFeature('hole'), bayId: 'gone' }],
      }).errors.join(),
    ).toContain('no longer exists')
    expect(service(s, { version: 1, features: [] }).scene).not.toBeNull()
  })
  it('rejects an association with a different cabinet', () => {
    const s = motionScene(),
      other = { ...structuredClone(cabinet(s)), id: 'other', position: { x: 1000, y: 0, z: 0 } }
    s.components.push(other)
    const next = applyPipeline(s),
      linked = {
        ...defaultApplianceBay('foreign', 'other', applianceOpenings(next, 'other')[0].id),
      }
    next.applianceBays = [linked]
    expect(
      previewService(next, 'cab', panel(next).id, {
        version: 1,
        features: [{ ...defaultServiceFeature('foreign-hole'), bayId: 'foreign' }],
      }).errors.join(),
    ).toContain('panel’s cabinet')
  })
  it('rejects stale, no-op, invalid and colliding-ID proposals; recomputes cached scenes', () => {
    const s = motionScene(),
      p = service(s)
    const changed = structuredClone(s)
    cabinet(changed).params.width += 1
    expect(acceptService(changed, p)).toBeNull()
    p.scene!.parts = []
    const next = acceptService(s, p)!
    expect(next.parts).toHaveLength(s.parts.length)
    expect(acceptService(next, previewService(next, 'cab', panel(next).id, recipe()))).toBeNull()
    expect(previewService(s, 'cab', 'missing', recipe()).errors.join()).toContain('panel')
    panel(s).cuts.push({
      kind: 'box',
      id: serviceCutId('hole', 0),
      label: 'Other',
      face: '+Z',
      position: { x: 0, y: 0, z: 0 },
      size: { x: 1, y: 1, z: 1 },
    })
    expect(previewService(s, 'cab', panel(s).id, recipe()).errors.join()).toContain('ID conflicts')
  })
  it('validates recipe enums, finite dimensions, IDs and bounded repeats', () => {
    const f = defaultServiceFeature('f')
    for (const patch of [
      { count: 0 },
      { count: 33 },
      { count: 1.5 },
      { count: 2, pitch: 0 },
      { web: -1 },
      { face: '+X' },
      { axis: 'z' },
      { bayId: '' },
      { pitch: Infinity },
    ])
      expect(serviceMachiningError({ version: 1, features: [{ ...f, ...patch }] })).not.toBeNull()
    expect(serviceMachiningError({ version: 1, features: [f, f] })).toMatch(/unique/)
    expect(
      serviceMachiningError({
        version: 1,
        features: Array.from({ length: 4 }, (_, i) => ({ ...f, id: String(i), count: 32 })),
      }),
    ).toEqual(expect.stringMatching(/100/))
  })
})
describe('appliance/service project files', () => {
  it('round trips recipes and regenerates ordinary manufacturing cuts', () => {
    let s = motionScene()
    const b = bay(s)
    s = acceptAppliance(s, previewAppliance(s, b))!
    s = acceptService(s, service(s))!
    const loaded = parseFile(JSON.stringify(file(s))).scene
    expect(loaded.applianceBays).toEqual(s.applianceBays)
    const after = applyPipeline(loaded)
    expect(panel(after).serviceMachining).toEqual(recipe())
    expect(panel(after).cuts.some((c) => c.id === serviceCutId('hole', 0))).toBe(true)
    expect(
      manufacturingPart(panel(after), {
        materials: after.materials,
        byId: componentsById(after.components),
      }).cuts.some((c) => c.id === serviceCutId('hole', 0)),
    ).toBe(true)
    expect(FILE_FORMAT_VERSION).toBe(37)
    expect(componentsById(after.components).has('cab')).toBe(true)
  })
  it('rejects malformed bay and service data at both file boundaries', () => {
    const s = motionScene()
    s.applianceBays = [{ ...bay(s), width: -1 }]
    expect(() => parseFile(JSON.stringify(file(s)))).toThrow(/applianceBays/)
    expect(() => validateCurrentFile(file(s))).toThrow(/applianceBays/)
    delete s.applianceBays
    panel(s).serviceMachining = {
      version: 1,
      features: [{ ...defaultServiceFeature('f'), count: 0 }],
    }
    expect(() => parseFile(JSON.stringify(file(s)))).toThrow(/serviceMachining/)
    expect(() => validateCurrentFile(file(s))).toThrow(/serviceMachining/)
  })
  it('loads legacy files without inventing recipes and preserves broken bay references for repair', () => {
    const s = motionScene(),
      f = { ...file(s), version: 35 }
    expect(parseFile(JSON.stringify(f)).scene.applianceBays).toBeUndefined()
    s.applianceBays = [{ ...bay(s), openingId: 'lost' }]
    const loaded = parseFile(JSON.stringify(file(s))).scene
    expect(resolveAppliance(loaded, loaded.applianceBays![0]).errors.join()).toContain('opening')
  })
})
