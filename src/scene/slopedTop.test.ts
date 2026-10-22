import { jobSignature, groupByNestableMaterial } from './useNest'
import { parameterForRole } from './carcaseRoles'
import { finishingDraft, previewFinishing } from './finishingPanels'
import { runWorktopDraft, previewRunWorktop } from './runWorktops'
import { expect, it } from 'vitest'
import { slopeFixture } from './__fixtures__/slope'
import {
  previewSlope,
  acceptSlope,
  defaultSlopeDraft,
  slopeCompatibility,
  slopeShelfClearances,
} from './slopedTop'
import { slopedTopError, slopeMetrics } from './slopedTopRecipe'
import { applyPipeline } from './pipeline'
import { carcaseBounds } from './carcaseBounds'
import { roleThicknessFor, overridesOf } from './resolveThickness'
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'
import { mitredCorners, computeMitreTool, mitreFaceOutline } from '../geom/mitre'
import { shapeKey } from './utils'
import { occupancyMask } from '../nest/mask'
import { manufacturingParts } from './manufacturingPart'
import { buildSlopeCsv } from '../ui/buildSlopeCsv'
import { buildDrawingSheets } from '../geom/drawing'
import { buildSheetSvg } from '../ui/buildSheetSvg'
import { validateCurrentFile, validateLegacyFileInput } from './fileValidation'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import type { BoardPart, CarcaseComponent, MitreCut, Scene, ZimmuFile } from './types'
const cab = (s: Scene) => s.components.find((c): c is CarcaseComponent => c.kind === 'carcase')!
const board = (s: Scene, role: string) =>
  s.parts.find((p): p is BoardPart => p.kind === 'board' && p.role === role)!
const accepted = (f = slopeFixture()) =>
  acceptSlope(f.scene, f.project, previewSlope(f.scene, f.project, f.draft))!
const corners = (b: BoardPart) =>
  mitredCorners(
    b,
    b.cuts.filter((c): c is MitreCut => c.kind === 'mitre'),
  ).map((v) => {
    const q = applyMatrixToPoint(composeWorldMatrix(b), v.x, v.y, v.z)
    return { x: q[0], y: q[1], z: q[2] }
  })
it.each([
  ['width', 800, 600],
  ['width', 600, 800],
  ['depth', 800, 600],
  ['depth', 600, 800],
] as const)('generates exact roof contact for %s %s→%s', (axis, first, second) => {
  const f = slopeFixture()
  f.draft.profile.axis = axis
  f.draft.first = first
  f.draft.second = second
  const p = previewSlope(f.scene, f.project, f.draft)
  expect(p.errors).toEqual([])
  expect(p.changed).toBe(true)
  const s = p.scene!,
    c = cab(s),
    m = slopeMetrics(c.params),
    top = board(s, 'top')
  expect(m.start).toBe(first)
  expect(m.end).toBe(second)
  expect(m.angle).toBeCloseTo(
    (Math.atan((second - first) / (axis === 'width' ? 600 : 500)) * 180) / Math.PI,
  )
  const pts = corners(top)
  for (const v of pts) {
    expect(v.x).toBeGreaterThanOrEqual(-0.00001)
    expect(v.x).toBeLessThanOrEqual(600.00001)
    expect(v.y).toBeGreaterThanOrEqual(-0.00001)
    expect(v.y).toBeLessThanOrEqual(500.00001)
    expect(v.z).toBeLessThanOrEqual(m.roof(v.x, v.y) + 0.00001)
    const gap = m.roof(v.x, v.y) - v.z
    expect(Math.min(Math.abs(gap), Math.abs(gap - 18 / m.c))).toBeLessThan(0.00001)
  }
  for (const role of ['left-side', 'right-side', 'back']) {
    const v = corners(board(s, role)).filter((_, i) => i >= 4)
    for (const q of v) expect(q.z).toBeCloseTo(m.roof(q.x, q.y) - 18 / m.c, 5)
  }
  expect(s.joints.filter((j) => j.sourceComponentId === c.id)).toEqual([])
  expect(board(s, 'bottom').position).toEqual(board(f.scene, 'bottom').position)
  expect(s.parts.map((p) => p.id).sort()).toEqual(f.scene.parts.map((p) => p.id).sort())
  expect(applyPipeline(s)).toEqual(s)
})
it('uses true cap length and bevel allowance with overhangs and matching occupied bounds', () => {
  const f = slopeFixture()
  f.draft.profile = { ...f.draft.profile, left: 20, right: 30, front: 10, back: 15 }
  const s = accepted(f),
    p = cab(s).params,
    m = slopeMetrics(p),
    top = board(s, 'top'),
    t = roleThicknessFor(p, s.materials, overridesOf(s.parts, cab(s).id)),
    bounds = carcaseBounds(p, t)
  expect(top.length).toBeCloseTo(650 / m.c + 18 * Math.abs(m.m), 6)
  expect(top.width).toBe(525)
  expect(bounds).toMatchObject({ x0: -20, x1: 630, y0: -10, y1: 515 })
  expect(bounds.z1).toBeCloseTo(806.6666666667)
  for (const v of corners(top)) {
    expect(v.x).toBeGreaterThanOrEqual(bounds.x0 - 0.00001)
    expect(v.x).toBeLessThanOrEqual(bounds.x1 + 0.00001)
    expect(v.z).toBeLessThanOrEqual(bounds.z1 + 0.00001)
  }
})
it('keeps shelves horizontal, pin drilling aligned and clear of the roof', () => {
  const f = slopeFixture(),
    s = accepted(f),
    m = slopeMetrics(cab(s).params),
    shelves = s.parts.filter(
      (p): p is BoardPart =>
        p.kind === 'board' &&
        !!(p.role?.startsWith('fixed-shelf-') || p.role?.startsWith('adj-shelf-')),
    )
  expect(shelves.length).toBeGreaterThan(1)
  for (const b of shelves) {
    expect(b.rotation).toEqual({ x: 0, y: 0, z: 0 })
    for (const v of corners(b)) expect(v.z).toBeLessThan(m.roof(v.x, v.y) - 18 / m.c)
  }
  const side = board(s, 'left-side'),
    holes = side.cuts.filter((c) => c.kind === 'hole-array')
  expect(holes.length).toBeGreaterThan(0)
  for (const h of holes) {
    if (h.kind !== 'hole-array') continue
    expect(h.axis).toBe('U')
    const w = applyMatrixToPoint(composeWorldMatrix(side), h.start.x, h.start.y, h.start.z)
    expect(w[0]).toBeCloseTo(18)
    expect([37, 463]).toContain(Math.round(w[1]))
    expect(w[2]).toBeGreaterThan(18)
    expect(h.face).toBe('-Z')
  }
})
it('grows top-reaching dividers to the roof without tilting horizontal divisions', () => {
  const f = slopeFixture(),
    c = cab(f.scene)
  c.params.section = {
    id: 'root',
    size: { kind: 'equal' },
    content: {
      kind: 'split',
      axis: 'vertical',
      division: 'panel',
      children: [
        { id: 'a', size: { kind: 'equal' }, content: { kind: 'leaf' } },
        { id: 'b', size: { kind: 'equal' }, content: { kind: 'leaf' } },
      ],
    },
  }
  f.scene = applyPipeline(f.scene)
  const s = accepted(f),
    d = board(s, 'division-root-0'),
    m = slopeMetrics(cab(s).params)
  expect(d).toBeDefined()
  expect(d.length).toBeGreaterThan(580)
  for (const v of corners(d).slice(4)) expect(v.z).toBeCloseTo(m.roof(v.x, v.y) - 18 / m.c, 5)
})
it('preserves toe-kick notches and ladder/bottom geometry while remapping board frames', () => {
  for (const baseMode of ['toe-kick', 'ladder'] as const) {
    const f = slopeFixture()
    cab(f.scene).params.baseMode = baseMode
    f.scene = applyPipeline(f.scene)
    const s = accepted(f)
    expect(board(s, 'bottom').position).toEqual(board(f.scene, 'bottom').position)
    if (baseMode === 'toe-kick') {
      const side = board(s, 'left-side'),
        cut = side.cuts.find((c) => c.kind === 'box' && c.id.includes('toekick'))!
      expect(cut.kind).toBe('box')
      if (cut.kind === 'box') {
        expect(cut.size.x).toBe(cab(s).params.toeKickHeight)
        expect(cut.size.y).toBe(cab(s).params.toeKickSetback)
      }
    } else {
      const a = board(s, 'ladder-front'),
        b = board(f.scene, 'ladder-front')
      expect([a.length, a.width, a.thickness, a.position, a.rotation]).toEqual([
        b.length,
        b.width,
        b.thickness,
        b.position,
        b.rotation,
      ])
    }
  }
})
it('preserves material/thickness overrides and world grain through enable, resize and disable', () => {
  const f = slopeFixture(),
    left = board(f.scene, 'left-side')
  left.overrides = { material: 'Slope panel', thickness: 25, grain: 'width' }
  left.grain = 'width'
  f.scene = applyPipeline(f.scene)
  const s = accepted(f),
    side = board(s, 'left-side')
  expect(side.thickness).toBe(25)
  expect(side.grain).toBe('length')
  expect(side.overrides!.grain).toBe('length')
  cab(s).params.height = 900
  cab(s).params.width = 800
  const resized = applyPipeline(s)
  expect(slopeMetrics(cab(resized).params).start).toBe(900)
  expect(slopeMetrics(cab(resized).params).end).toBe(700)
  const d = defaultSlopeDraft(resized, f.cabinetId)
  d.enabled = false
  const flat = acceptSlope(resized, f.project, previewSlope(resized, f.project, d))!
  expect(cab(flat).params.slopedTop).toBeUndefined()
  expect(cab(flat).params.height).toBe(900)
  expect(board(flat, 'left-side').grain).toBe('width')
  expect(board(flat, 'left-side').cuts.some((c) => c.kind === 'mitre')).toBe(false)
})
it('rejects invalid construction and slope dimensions without changing source geometry', () => {
  const f = slopeFixture(),
    before = JSON.stringify(f.scene)
  for (const change of [
    { frame: { stileWidth: 50, railWidth: 50, midStileWidth: 50, midRailWidth: 50 } },
    { hasTop: false },
    { backMode: 'captured' as const },
  ]) {
    const s = structuredClone(f.scene)
    Object.assign(cab(s).params, change)
    expect(previewSlope(s, f.project, f.draft).errors.join()).toContain('require')
  }
  const front = structuredClone(f.scene)
  cab(front).params.section.front = { kind: 'door', leaves: 1, hinge: 'left' }
  expect(previewSlope(front, f.project, f.draft).errors.join()).toContain('open')
  expect(previewSlope(f.scene, f.project, { ...f.draft, second: 10 }).errors.join()).toContain(
    'minimum',
  )
  expect(previewSlope(f.scene, f.project, { ...f.draft, second: NaN }).errors.join()).toContain(
    'finite',
  )
  const steep = structuredClone(f.draft)
  steep.profile.axis = 'depth'
  steep.first = 1800
  steep.second = 600
  expect(previewSlope(f.scene, f.project, steep).errors.join()).toContain('60')
  expect(JSON.stringify(f.scene)).toBe(before)
})
it('rejects stale/no-op requests, missing and incompatible sources, and ignores forged geometry', () => {
  const f = slopeFixture(),
    p = previewSlope(f.scene, f.project, f.draft),
    s = accepted(f)
  expect(previewSlope(s, f.project, defaultSlopeDraft(s, f.cabinetId)).changed).toBe(false)
  expect(
    acceptSlope(s, f.project, previewSlope(s, f.project, defaultSlopeDraft(s, f.cabinetId))),
  ).toBeNull()
  const project = structuredClone(f.project)
  project.areas[0].name = 'Changed'
  expect(acceptSlope(f.scene, project, p)).toBeNull()
  const forged = { ...p, scene: { ...f.scene, parts: [] } }
  expect(acceptSlope(f.scene, f.project, forged)!.parts.length).toBe(f.scene.parts.length)
  expect(slopeCompatibility(f.scene, 'gone').join()).toContain('existing')
  const detach = structuredClone(f.scene)
  board(detach, 'left-side').driven = false
  expect(previewSlope(detach, f.project, f.draft).errors.join()).toContain('Detached')
  const tilt = structuredClone(f.scene)
  cab(tilt).rotation.x = 5
  expect(previewSlope(tilt, f.project, f.draft).errors.join()).toContain('upright')
  const manual = structuredClone(f.scene)
  board(manual, 'left-side').cuts.push({
    kind: 'mitre',
    id: 'custom',
    label: 'Custom',
    end: '+X',
    axis: 'Y',
    angle: 10,
  })
  expect(previewSlope(manual, f.project, f.draft).errors.join()).toContain('Manual')
})
it('shares flipped bevel planes with exact corners, drawing outlines, masks and cache keys', () => {
  const b = { length: 200, width: 100, thickness: 25 },
    cut: MitreCut = {
      kind: 'mitre',
      id: 'm',
      label: 'Bevel',
      end: '+X',
      axis: 'Y',
      angle: 45,
      flip: true,
    },
    tool = computeMitreTool(b, cut)
  expect(tool.pivot).toEqual({ x: 200, y: 0, z: 25 })
  expect(tool.angleRad).toBeCloseTo(Math.PI / 4)
  expect(mitreFaceOutline(b, [cut], 'Edge')).toEqual([
    { x: 0, y: 0 },
    { x: 175, y: 0 },
    { x: 200, y: 25 },
    { x: 0, y: 25 },
  ])
  const p = board(slopeFixture().scene, 'back'),
    base = { ...p, ...b, cuts: [cut] }
  expect(shapeKey(base)).not.toBe(shapeKey({ ...base, cuts: [{ ...cut, flip: false }] }))
  const flat = { ...cut, axis: 'Z' as const }
  expect(mitreFaceOutline(b, [flat], 'Face')[1].x).toBeCloseTo(100)
  const mask = occupancyMask({ ...base, cuts: [{ ...flat, sourceComponentId: 'cab' }] }, 0)
  expect(mask.bits.reduce((a, b) => a + b, 0)).toBe(20000)
  const svg = buildSheetSvg(
    { length: 500, width: 200 },
    [{ id: p.id, sheet: 0, x: 0, y: 0, w: 200, h: 100, rotation: 0 }],
    () => p.label,
  )
  expect(svg).toContain('svg')
})
it('exports sloped panel dimensions, flipped-end notes and profile drawings', () => {
  const s = accepted(),
    records = manufacturingParts(s.parts, s.materials, s.components),
    csv = buildSlopeCsv(records)
  expect(csv).toContain('Through-thickness bevel')
  expect(csv).toContain('Opposite edge')
  expect(csv).toContain('Flat profile')
  const top = board(s, 'top'),
    sheets = buildDrawingSheets([top], 'Slope')
  const sheet = sheets.find((s) => s.kind === 'part')!
  expect(sheet.kind).toBe('part')
  if (sheet.kind === 'part' && sheet.shape === 'board')
    expect(sheet.views.some((v) => v.boardOutline)).toBe(true)
})
it('roundtrips format 42, rejects malformed optional fields on both boundaries and loads older files', () => {
  const f = slopeFixture(),
    s = accepted(f),
    raw = {
      version: FILE_FORMAT_VERSION,
      name: 'Slope',
      appVersion: '0',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      scene: s,
      project: f.project,
      camera: { position: { x: 0, y: 0, z: 1000 }, target: { x: 0, y: 0, z: 0 } },
    } as ZimmuFile
  expect(FILE_FORMAT_VERSION).toBe(42)
  expect(cab(parseFile(JSON.stringify(raw)).scene).params.slopedTop).toEqual(
    cab(s).params.slopedTop,
  )
  for (const validate of [validateCurrentFile, validateLegacyFileInput]) {
    const bad = structuredClone(raw)
    cab(bad.scene).params.slopedTop!.drop = -1
    expect(() => validate(bad)).toThrow('slopedTop')
    const flip = structuredClone(raw)
    ;(board(flip.scene, 'top').cuts[0] as unknown as { flip: unknown }).flip = 'yes'
    expect(() => validate(flip)).toThrow('flip')
  }
  const old = structuredClone(raw)
  old.version = 41
  delete cab(old.scene).params.slopedTop
  expect(cab(parseFile(JSON.stringify(old)).scene).params.slopedTop).toBeUndefined()
})
it.each([
  null,
  { version: 2 },
  { axis: 'bad' },
  { highEnd: 'bad' },
  { drop: NaN },
  { drop: -1 },
  { drop: 10001 },
  { left: -1 },
  { right: 201 },
  { minClearance: 0 },
  { minClearance: 1001 },
])('rejects malformed slope recipes %j', (change) => {
  const d = slopeFixture().draft.profile
  expect(slopedTopError(change === null ? null : { ...d, ...change })).not.toBeNull()
})

it.each(['+X', '-X'] as const)(
  'puts the opposite long edge on the cut plane for %s flat and bevel cuts',
  (end) => {
    for (const axis of ['Z', 'Y'] as const) {
      const b = { length: 200, width: 100, thickness: 25 },
        cut: MitreCut = { kind: 'mitre', id: 'm', label: 'Flip', end, axis, angle: 30, flip: true },
        t = computeMitreTool(b, cut),
        V = axis === 'Z' ? 100 : 25,
        normalV = (axis === 'Z' ? 1 : -1) * Math.sin(t.angleRad),
        normalX = Math.cos(t.angleRad),
        xAtZero = t.pivot.x + (normalV * V) / normalX
      expect(axis === 'Z' ? t.pivot.y : t.pivot.z).toBe(V)
      expect(xAtZero).toBeCloseTo(
        end === '+X' ? 200 - V * Math.tan(Math.PI / 6) : V * Math.tan(Math.PI / 6),
        6,
      )
      const poly = mitreFaceOutline(b, [cut], axis === 'Z' ? 'Face' : 'Edge')
      expect(poly[end === '+X' ? 1 : 0].x).toBeCloseTo(xAtZero, 6)
      expect(poly[end === '+X' ? 2 : 3].x).toBe(end === '+X' ? 200 : 0)
    }
  },
)
it('reports individual shelf headroom and rejects cap overhangs that cross the floor', () => {
  const f = slopeFixture(),
    s = accepted(f),
    headroom = slopeShelfClearances(s, f.cabinetId)
  expect(previewSlope(f.scene, f.project, f.draft).openingHeight).toBeCloseTo(
    600 - 18 * Math.sqrt(1 + 1 / 9) - 18,
  )
  expect(headroom.length).toBeGreaterThan(2)
  expect(headroom.every((r) => r.headroom > 0)).toBe(true)
  const d = structuredClone(f.draft)
  d.first = 900
  d.second = 100
  d.profile.right = 200
  expect(previewSlope(f.scene, f.project, d).errors.join()).toContain('floor')
})
it('retains room rotation and rejects manual joints, hardware and dependent recipes', () => {
  const f = slopeFixture()
  cab(f.scene).rotation.z = 90
  expect(previewSlope(f.scene, f.project, f.draft).errors).toEqual([])
  const joint = structuredClone(f.scene)
  joint.joints[0].driven = false
  expect(slopeCompatibility(joint, f.cabinetId).join()).toContain('User-owned')
  const hardware = structuredClone(f.scene)
  board(hardware, 'left-side').frontPull = { version: 1 } as never
  expect(slopeCompatibility(hardware, f.cabinetId).join()).toContain('hardware')
  const linked = structuredClone(f.scene)
  linked.installations = [{ draft: { memberIds: [f.cabinetId] } } as never]
  expect(slopeCompatibility(linked, f.cabinetId).join()).toContain('Linked')
})
it('leaves finishing defaults readable but rejects unsupported linked panel previews', () => {
  const f = slopeFixture(),
    s = accepted(f)
  const single = finishingDraft(s, f.cabinetId)
  expect(previewFinishing(s, f.cabinetId, single).errors.join()).toContain('sloped')
  const second = structuredClone(cab(s))
  second.id = 'second'
  second.position.x = 600
  s.components.push(second)
  const run = runWorktopDraft(s, f.cabinetId)
  run.memberIds = [f.cabinetId, 'second']
  expect(previewRunWorktop(s, run).errors.join()).toContain('flat-top')
})
it('handles zero drop and rejects malformed enable requests and empty cabinet selection', () => {
  const f = slopeFixture(),
    d = { ...f.draft, first: 800, second: 800 },
    p = previewSlope(f.scene, f.project, d)
  expect(p.errors).toEqual([])
  expect(board(p.scene!, 'top').length).toBe(600)
  expect(board(p.scene!, 'top').cuts.filter((c) => c.kind === 'mitre')).toEqual([])
  expect(
    previewSlope(f.scene, f.project, { ...d, enabled: 'yes' as never }).errors.join(),
  ).toContain('enable')
  expect(previewSlope(f.scene, f.project, { ...d, cabinetId: 'gone' }).errors.join()).toContain(
    'existing',
  )
})

it('reserves complete fractional profile bounds and includes nesting policy in job signatures', () => {
  const s = accepted(),
    back = board(s, 'back'),
    mask = occupancyMask(back, 0),
    groups = groupByNestableMaterial(s.parts, s.materials, s.components),
    before = jobSignature(groups, 0)
  expect(mask.bits.reduce((a, b) => a + b, 0)).toBe(Math.ceil(back.length) * Math.ceil(back.width))
  const changed = structuredClone(groups),
    p = changed.flatMap((g) => g.parts).find((p) => p.id === back.id)!,
    geometry = shapeKey(p)
  p.cuts = p.cuts.map((c) => (c.kind === 'mitre' ? { ...c, sourceComponentId: undefined } : c))
  expect(shapeKey(p)).toBe(geometry)
  expect(jobSignature(changed, 0)).not.toBe(before)
  expect(parameterForRole('left-side', 'length', cab(s).params)).toBeNull()
})

it('keeps independent shaped copies outside cabinet source-machining compatibility checks', () => {
  const f = slopeFixture(),
    s = accepted(f),
    source = board(s, 'top'),
    copy = {
      ...structuredClone(source),
      id: 'independent',
      role: undefined,
      driven: false,
      cuts: source.cuts.map((c) => ({ ...c, sourceComponentId: undefined })),
    }
  s.parts.push(copy)
  expect(slopeCompatibility(s, f.cabinetId)).toEqual([])
  const draft = defaultSlopeDraft(s, f.cabinetId)
  draft.enabled = false
  const p = previewSlope(s, f.project, draft)
  expect(p.errors).toEqual([])
  expect(p.scene!.parts.find((p) => p.id === copy.id)).toEqual(copy)
})
