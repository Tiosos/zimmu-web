import { expect, it } from 'vitest'
import { cornerScene } from './__fixtures__/corners'
import { applyPipeline } from './pipeline'
import {
  cornerCandidates,
  acceptCorner,
  cornerDraft,
  cornerIssues,
  previewCorner,
  regenerateCorners,
} from './cornerPanels'
import { cornerDraftError, cornerLinkError } from './cornerRecipe'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import { validateCurrentFile, validateLegacyFileInput } from './fileValidation'
import type { BoardPart, CarcaseComponent, Scene, ZimmuFile } from './types'
import { materialTargets } from './cabinetMaterials'
import { worktopMachiningEligible } from './worktopMachining'
import { applianceOpenings } from './applianceBays'

const draft = (s: Scene, profile?: 'plinth' | 'splashback') => {
  const d = cornerDraft(s, 'a', profile)
  d.legs[1].run.memberIds = ['b']
  return d
}
const own = (s: Scene) =>
  s.parts.filter((p): p is BoardPart => p.kind === 'board' && !!p.cornerPanel)
const saved = (s = cornerScene()) => acceptCorner(s, previewCorner(s, draft(s)), 'corner')!
const cab = (s: Scene, id = 'b') => s.components.find((c) => c.id === id) as CarcaseComponent
it('builds an explicit two-board right corner without mutating the scene', () => {
  const s = cornerScene(),
    before = JSON.stringify(s),
    p = previewCorner(s, draft(s))
  expect(p.errors).toEqual([])
  expect(p.boxes).toEqual([
    { x0: 0, x1: 1238, y0: -38, y1: 560, z0: 720, z1: 738 },
    { x0: 640, x1: 1238, y0: -600, y1: -38, z0: 720, z1: 738 },
  ])
  expect(p.parts.map((p) => [p.length, p.width, p.thickness])).toEqual([
    [1238, 598, 18],
    [562, 598, 18],
  ])
  expect(JSON.stringify(s)).toBe(before)
  expect(own(saved(s)).map((p) => p.id)).toEqual(['corner_0', 'corner_1'])
})
it('switches the through leg and applies an explicit clearance', () => {
  const s = cornerScene(),
    d = draft(s)
  d.through = 1
  d.gap = '3'
  const p = previewCorner(s, d)
  expect(p.errors).toEqual([])
  expect(p.boxes[0].x1).toBe(637)
  expect(p.boxes[1].y1).toBe(560)
  expect(p.issues.join(' ')).toContain('3 mm clearance')
})
it('supports a mirrored left return', () => {
  const s = cornerScene()
  cab(s).rotation.z = 270
  cab(s).position = { x: 0, y: 0, z: 0 }
  const p = previewCorner(s, draft(s))
  expect(p.errors).toEqual([])
  expect(p.boxes[0].x0).toBeCloseTo(-38)
  expect(p.boxes[1].y1).toBeCloseTo(-38)
})
it('handles a shared rotated container and rotated runs with the same dimensions', () => {
  const s = cornerScene()
  s.components.push({
    kind: 'group',
    id: 'room',
    label: 'Room',
    parentId: null,
    position: { x: 100, y: 200, z: 30 },
    rotation: { x: 20, y: 0, z: 35 },
    rotationOrder: 'XYZ',
    visible: true,
  })
  for (const c of s.components.filter((c) => c.kind === 'carcase')) c.parentId = 'room'
  const p = previewCorner(s, draft(s))
  expect(p.errors).toEqual([])
  expect(p.parts[0].parentId).toBe('room')
  expect(p.parts[0].length).toBe(1238)
})
it.each(['plinth', 'splashback'] as const)(
  'generates and persists %s boards and both end returns',
  (profile) => {
    const s = cornerScene(),
      d = draft(s, profile)
    d.legs.forEach((l) => (l.endReturn = true))
    const p = previewCorner(s, d)
    expect(p.errors).toEqual([])
    expect(p.parts).toHaveLength(4)
    const result = acceptCorner(s, p, 'finish')!
    expect(own(result)).toHaveLength(4)
    expect(own(applyPipeline(result))).toEqual(own(result))
    expect(worktopMachiningEligible(own(result)[0])).toBe(false)
  },
)
it('regenerates linked cabinets with stable board IDs and preserves machining and visibility', () => {
  const s = saved()
  const p = own(s)[0]
  p.visible = false
  p.cuts = [
    {
      kind: 'box',
      id: 'manual',
      label: 'Manual',
      face: '+Z',
      position: { x: 20, y: 20, z: 0 },
      size: { x: 10, y: 10, z: 5 },
    },
  ]
  cab(s, 'a').params.width = 1300
  cab(s).position.x = 1300
  const next = applyPipeline(s)
  expect(own(next)[0].id).toBe('corner_0')
  expect(own(next)[0].length).toBe(1338)
  expect(own(next)[0].cuts).toEqual(p.cuts)
  expect(own(next)[0].visible).toBe(false)
  expect(cornerIssues(next, 'corner').join(' ')).toContain('machining')
})
it('rejects stale and tampered previews, no-ops and ID collisions', () => {
  const s = cornerScene(),
    p = previewCorner(s, draft(s))
  expect(
    acceptCorner({ ...s, materials: { ...s.materials, New: { thickness: 12 } } }, p, 'x'),
  ).toBeNull()
  expect(acceptCorner(s, { ...p, draft: { ...p.draft, gap: '' } }, 'x')).toBeNull()
  expect(acceptCorner(s, p, 'a')).not.toBeNull() // assembly IDs are a separate namespace
  const once = saved(s)
  expect(acceptCorner(once, previewCorner(once, draft(once), 'corner'), 'unused')).toBeNull()
  expect(
    acceptCorner(
      { ...s, components: [...s.components, { ...cab(s), id: 'clash_0' }] },
      previewCorner(
        { ...s, components: [...s.components, { ...cab(s), id: 'clash_0' }] },
        draft(s),
      ),
      'clash',
    ),
  ).toBeNull()
  const forged = { ...p, parts: [] }
  expect(own(acceptCorner(s, forged, 'safe')!)).toHaveLength(2)
})
it('edits, detaches and removes entire assemblies atomically', () => {
  const s = saved(),
    d = draft(s)
  d.label = 'New corner'
  const edit = acceptCorner(s, previewCorner(s, d, 'corner'), 'ignored')!
  expect(own(edit).map((p) => p.id)).toEqual(['corner_0', 'corner_1'])
  expect(own(edit)[0].label).toContain('New corner')
  const request = previewCorner(edit, d, 'corner')
  const detached = acceptCorner(edit, { ...request, action: 'detach' }, 'ignored')!
  expect(own(detached)).toHaveLength(0)
  expect(detached.parts.length).toBe(edit.parts.length)
  const removed = acceptCorner(edit, { ...request, action: 'delete' }, 'ignored')!
  expect(removed.parts.length).toBe(edit.parts.length - 2)
})
it('retains last geometry for missing cabinets or incomplete assemblies without recreating boards', () => {
  const s = saved()
  s.components = s.components.filter((c) => c.id !== 'b')
  expect(own(regenerateCorners(s))).toEqual(own(s))
  expect(cornerIssues(s, 'corner').join(' ')).toContain('Missing')
  const partial = saved()
  partial.parts = partial.parts.filter((p) => p.id !== 'corner_1')
  expect(own(regenerateCorners(partial))).toHaveLength(1)
  expect(cornerIssues(partial, 'corner').join(' ')).toContain('incomplete')
  const clean = acceptCorner(
    partial,
    { ...previewCorner(partial, draft(partial), 'corner'), action: 'detach' },
    'unused',
  )!
  expect(own(clean)).toHaveLength(0)
})
it.each([
  [
    'parallel',
    (s: Scene) => {
      cab(s).rotation.z = 0
    },
    'perpendicular',
  ],
  [
    'tilted',
    (s: Scene) => {
      cab(s).rotation.x = 10
    },
    'upright',
  ],
  [
    'different container',
    (s: Scene) => {
      s.components.push({
        kind: 'group',
        id: 'other-room',
        label: 'Other room',
        parentId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        visible: true,
      })
      cab(s).parentId = 'other-room'
    },
    'container',
  ],
  [
    'height mismatch',
    (s: Scene) => {
      cab(s).position.z = 20
    },
    'planes',
  ],
  [
    'remote runs',
    (s: Scene) => {
      cab(s).position.y = -3000
    },
    'end corner',
  ],
] as const)('rejects %s', (_name, change, message) => {
  const s = cornerScene()
  change(s)
  expect(previewCorner(s, draft(s)).errors.join(' ')).toContain(message)
})
it('rejects malformed, duplicate, oversized, unsupported and mismatched profile recipes', () => {
  const s = cornerScene(),
    d = draft(s)
  for (const gap of ['', '-1', 'Infinity', '1001'])
    expect(cornerDraftError({ ...d, gap })).toEqual(expect.any(String))
  expect(cornerDraftError({ ...d, legs: [d.legs[0], d.legs[0]] })).toContain('only one')
  d.legs[0].run.left = '100001'
  expect(cornerDraftError(d)).toContain('100000')
  d.legs[0].run.left = '0'
  d.legs[0].run.material = 'missing'
  expect(previewCorner(s, d).errors.join(' ')).toContain('material')
  d.legs[0].run.material = d.legs[1].run.material
  d.legs[0].endReturn = true
  expect(cornerDraftError(d)).toContain('vertical')
  expect(cornerLinkError({ version: 2 })).toContain('version')
  expect(cornerLinkError({ ...own(saved())[0].cornerPanel, slot: 2 })).toContain('slot')
})
it('applies independent grain, materials and real edge decisions, including bad stock refusal', () => {
  const s = cornerScene()
  s.materials.Tape = { thickness: 1 }
  const d = draft(s)
  d.legs[1].run.grain = 'width'
  d.legs[0].edges = { x0: 'Tape', y1: null }
  const p = previewCorner(s, d)
  expect(p.errors).toEqual([])
  expect(p.parts[0].edgeBanding).toEqual({ x0: 'Tape', y1: null })
  expect(p.parts[1].grain).toBe('width')
  d.legs[0].edges.x0 = 'missing'
  expect(previewCorner(s, d).errors.join(' ')).toContain('thickness')
})
it('reports existing board conflicts and shares owned boards with appliance/service checks while locking bulk treatments', () => {
  const s = saved(),
    p = own(s)[0]
  s.parts.push({
    ...p,
    id: 'other',
    cornerPanel: undefined,
    finishing: { version: 1, draft: {} },
  } as BoardPart)
  expect(previewCorner(s, draft(s), 'corner').issues.join(' ')).toContain('Interference')
  const targets = materialTargets(s, 'b').filter((t) => t.board.cornerPanel)
  expect(targets).toHaveLength(2)
  expect(targets.every((t) => t.locked && t.shared)).toBe(true)
})
it('round trips format 37 and refuses malformed or competing ownership at both validation boundaries', () => {
  const s = saved(),
    file = {
      version: FILE_FORMAT_VERSION,
      name: 'Corner',
      appVersion: '0',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      scene: s,
      camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
    } as unknown as ZimmuFile
  expect(FILE_FORMAT_VERSION).toBe(42)
  expect(own(parseFile(JSON.stringify(file)).scene)).toEqual(JSON.parse(JSON.stringify(own(s))))
  for (const validate of [validateCurrentFile, validateLegacyFileInput]) {
    const bad = structuredClone(file)
    ;(own(bad.scene)[0].cornerPanel as unknown as { version: number }).version = 4
    expect(() => validate(bad)).toThrow(/cornerPanel/)
    const competing = structuredClone(file)
    own(competing.scene)[0].driven = true
    expect(() => validate(competing)).toThrow(/cornerPanel/)
  }
})

it('detects compatible perpendicular run pairs and omits remote or parallel candidates', () => {
  const s = cornerScene(),
    d = cornerDraft(s, 'a'),
    found = cornerCandidates(s, d)
  expect(found).toHaveLength(1)
  expect(found[0].legs[1].run.memberIds).toEqual(['b'])
  cab(s).position.y = -3000
  expect(cornerCandidates(s, d)).toHaveLength(0)
  cab(s).rotation.z = 0
  expect(cornerCandidates(s, d)).toHaveLength(0)
})
it('handles multiple cabinets on both legs and different member depths', () => {
  const s = cornerScene()
  cab(s, 'a').params.width = 600
  s.components.push({
    ...structuredClone(cab(s, 'a')),
    id: 'a2',
    position: { x: 600, y: 0, z: 0 },
    params: { ...cab(s, 'a').params, depth: 500 },
  })
  s.components.push({ ...structuredClone(cab(s)), id: 'b2', position: { x: 1200, y: -1200, z: 0 } })
  const d = draft(s)
  d.legs[0].run.memberIds.push('a2')
  d.legs[1].run.memberIds.push('b2')
  const p = previewCorner(s, d)
  expect(p.errors).toEqual([])
  expect(p.boxes[0].x1).toBe(1238)
  expect(p.boxes[1].y0).toBe(-1200)
})
it('retains worktop feature recipes and reports incompatible cut-outs after resizing', () => {
  const s = saved(),
    p = own(s)[0]
  p.worktopMachining = {
    version: 1,
    features: [
      {
        id: 'hole',
        label: 'Cut-out',
        shape: 'circle',
        mode: 'through',
        x: 1100,
        y: 100,
        xRef: 'left',
        yRef: 'front',
        diameter: 35,
        length: 80,
        width: 40,
        depth: 5,
        clearance: 10,
      },
    ],
  }
  const d = draft(s)
  d.through = 1
  const preview = previewCorner(s, d, 'corner')
  expect(preview.errors).toEqual([])
  expect(preview.parts[0].worktopMachining).toEqual(p.worktopMachining)
  expect(preview.issues.join(' ')).toMatch(/edge|outside|boundary|fit/i)
})

it('rejects a joint that consumes an entire leg and reports incompatible profile machining', () => {
  const s = cornerScene(),
    d = draft(s)
  d.gap = '1000'
  expect(previewCorner(s, d).errors.join(' ')).toContain('consumes')
  const linked = saved(s)
  own(linked)[0].cuts = [
    {
      kind: 'box',
      id: 'cut',
      label: 'Cut',
      face: '+Z',
      position: { x: 10, y: 10, z: 0 },
      size: { x: 10, y: 10, z: 5 },
    },
  ]
  expect(previewCorner(linked, draft(linked, 'plinth'), 'corner').errors.join(' ')).toContain(
    'machining',
  )
})
it('detects real interference with an appliance reserved envelope on a corner panel', () => {
  const s = cornerScene()
  s.applianceBays = [
    {
      id: 'bay',
      cabinetId: 'a',
      openingId: applianceOpenings(s, 'a')[0].id,
      label: 'Tall appliance',
      category: 'Other',
      width: 300,
      height: 1000,
      depth: 300,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      rear: 0,
      alignment: 'centre',
      offset: 0,
      elevation: 0,
      recess: 0,
    },
  ]
  const p = previewCorner(s, draft(s))
  expect(p.errors).toEqual([])
  expect(p.issues.join(' ')).toContain('Tall appliance: Reserved space intersects Corner assembly')
})

it('rejects duplicate board slots rather than silently choosing a member', () => {
  const s = saved()
  s.parts.push({ ...own(s)[0], id: 'duplicate-slot' })
  expect(cornerIssues(s, 'corner').join(' ')).toContain('incomplete or inconsistent')
  expect(own(regenerateCorners(s))).toEqual(own(s))
})

it('returns no detected pairs when a saved first cabinet has been removed', () => {
  const s = cornerScene(),
    d = draft(s)
  s.components = s.components.filter((c) => c.id !== 'a')
  expect(cornerCandidates(s, d)).toEqual([])
})
