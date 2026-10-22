import { expect, it } from 'vitest'
import { runPanelScene } from './__fixtures__/runPanels'
import {
  runPanelDraft,
  previewRunWorktop,
  acceptRunWorktop,
  regenerateRunWorktops,
  runWorktopIssues,
  runWorktopDraft,
} from './runWorktops'
import { runDraftError, runWorktopLinkError } from './runWorktopRecipe'
import { worktopMachiningEligible } from './worktopMachining'
import { applyInverseToPoint, applyMatrixToPoint, resolveWorldMatrix } from '../geom/transform'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import { validateCurrentFile, validateLegacyFileInput } from './fileValidation'
import type { BoardPart, CarcaseComponent, Scene, ZimmuFile } from './types'
const draft = (scene: Scene, profile: 'plinth' | 'splashback' = 'plinth') => ({
  ...runPanelDraft(scene, 'a', profile),
  memberIds: ['a', 'b'],
})
const cab = (s: Scene, id = 'b') => s.components.find((c) => c.id === id) as CarcaseComponent
const panel = (s: Scene) => s.parts.find((p) => p.id === 'panel') as BoardPart
const add = (s = runPanelScene(), profile: 'plinth' | 'splashback' = 'plinth') =>
  acceptRunWorktop(s, previewRunWorktop(s, draft(s, profile)), 'panel')!
const file = (scene: Scene): ZimmuFile => ({
  version: FILE_FORMAT_VERSION,
  name: 'Run panels',
  units: 'mm',
  appVersion: '0.0.0',
  createdAt: '2026-10-21T00:00:00Z',
  updatedAt: '2026-10-21T00:00:00Z',
  camera: { position: { x: 0, y: 100, z: 100 }, target: { x: 0, y: 0, z: 0 } },
  scene,
})
it('builds a continuous plinth with toe height, extensions and clearance', () => {
  const s = runPanelScene(),
    p = previewRunWorktop(s, { ...draft(s), left: '10', right: '20', bottom: '5', setback: '60' })
  expect(p.errors).toEqual([])
  expect(p.part).toMatchObject({
    length: 95,
    width: 1230,
    thickness: 18,
    grain: 'width',
    parentId: null,
    driven: false,
    runWorktop: { version: 2 },
  })
  expect(p.bounds).toEqual({ x0: -10, x1: 1220, y0: 42, y1: 60, z0: 5, z1: 100 })
  expect(p.members).toHaveLength(2)
})
it('permits differing cabinet heights for plinths and follows the smallest toe height', () => {
  const s = runPanelScene()
  cab(s).params.height = 900
  cab(s).params.toeKickHeight = 80
  const p = previewRunWorktop(s, draft(s))
  expect(p.errors).toEqual([])
  expect(p.part!.length).toBe(80)
})
it('builds a splashback above aligned tops and behind aligned rears', () => {
  const s = runPanelScene(),
    p = previewRunWorktop(s, {
      ...draft(s, 'splashback'),
      height: '150',
      bottom: '10',
      setback: '8',
    })
  expect(p.errors).toEqual([])
  expect(p.bounds).toEqual({ x0: 0, x1: 1200, y0: 568, y1: 586, z0: 730, z1: 880 })
  expect(p.part).toMatchObject({ length: 150, width: 1200, thickness: 18 })
})
it.each([0, 90, 180, 37])(
  'composes vertical board orientation and transformed-parent placement at %s degrees',
  (angle) => {
    const s = runPanelScene(),
      r = (angle * Math.PI) / 180
    s.components = s.components.map((c, i) => ({
      ...c,
      parentId: 'group',
      position: { x: 80 + i * 600 * Math.cos(r), y: 120 + i * 600 * Math.sin(r), z: 30 },
      rotation: { x: 0, y: 0, z: angle },
    }))
    s.components.push({
      kind: 'group',
      id: 'group',
      label: 'Room',
      parentId: null,
      position: { x: 300, y: 400, z: 20 },
      rotation: { x: 0, y: 0, z: 25 },
      rotationOrder: 'XYZ',
      visible: true,
    })
    for (const profile of ['plinth', 'splashback'] as const) {
      const p = previewRunWorktop(s, draft(s, profile))
      expect(p.errors).toEqual([])
      const byId = new Map(s.components.map((c) => [c.id, c])),
        matrix = resolveWorldMatrix(p.part!, byId),
        ref = resolveWorldMatrix(cab(s, 'a'), byId)
      const points = [0, p.part!.length].flatMap((x) =>
        [0, p.part!.width].flatMap((y) =>
          [0, p.part!.thickness].map((z) =>
            applyInverseToPoint(ref, ...applyMatrixToPoint(matrix, x, y, z)),
          ),
        ),
      )
      for (const [axis, min, max] of [
        [0, 'x0', 'x1'],
        [1, 'y0', 'y1'],
        [2, 'z0', 'z1'],
      ] as const) {
        expect(Math.min(...points.map((p) => p[axis]))).toBeCloseTo(p.bounds![min], 5)
        expect(Math.max(...points.map((p) => p[axis]))).toBeCloseTo(p.bounds![max], 5)
      }
    }
  },
)
it('rejects incompatible bases, base planes, fronts, rear lines, tops, orientation and gaps', () => {
  const check = (change: (s: Scene) => void, profile: 'plinth' | 'splashback', message: string) => {
    const s = runPanelScene()
    change(s)
    expect(previewRunWorktop(s, draft(s, profile)).errors.join()).toContain(message)
  }
  check(
    (s) => {
      cab(s).params.baseMode = 'none'
    },
    'plinth',
    'toe-kick or ladder',
  )
  check(
    (s) => {
      cab(s).position.z = 20
    },
    'plinth',
    'base planes',
  )
  check(
    (s) => {
      cab(s).position.y = 20
    },
    'plinth',
    'fronts',
  )
  check(
    (s) => {
      cab(s).params.depth = 600
    },
    'splashback',
    'rear lines',
  )
  check(
    (s) => {
      cab(s).params.height = 900
    },
    'splashback',
    'top planes',
  )
  check(
    (s) => {
      cab(s).rotation.z = 90
    },
    'plinth',
    'orientations',
  )
  check(
    (s) => {
      cab(s).position.x = 610
    },
    'plinth',
    'allowed gap',
  )
})
it('allows explicit cabinet gaps and chooses stock/custom thickness', () => {
  const s = runPanelScene()
  cab(s).position.x = 610
  const p = previewRunWorktop(s, {
    ...draft(s),
    maxGap: '10',
    thicknessMode: 'custom',
    thickness: '24',
  })
  expect(p.errors).toEqual([])
  expect(p.part!.thickness).toBe(24)
  expect(p.part!.width).toBe(1210)
  expect(p.members[1].gapBefore).toBe(10)
})
it.each([{ heightMode: 'custom' as const, height: '101' }, { bottom: '100' }, { setback: '561' }])(
  'rejects plinth geometry that cannot fit all members %j',
  (patch) => {
    const s = runPanelScene()
    expect(previewRunWorktop(s, { ...draft(s), ...patch }).errors.length).toBeGreaterThan(0)
  },
)
it.each([
  { profile: 'other' },
  { height: '0' },
  { height: 'Infinity' },
  { height: '' },
  { setback: '-1' },
  { heightMode: 'bad' },
])('validates vertical profile dimensions and choices %j', (patch) => {
  const s = runPanelScene()
  expect(runDraftError({ ...draft(s), ...patch })).not.toBeNull()
})
it('requires profile-specific recipe versions without changing legacy worktop recipes', () => {
  const s = runPanelScene(),
    d = draft(s)
  expect(runWorktopLinkError({ version: 1, draft: d })).toContain('version 2')
  expect(runWorktopLinkError({ version: 2, draft: d })).toBeNull()
  expect(
    runWorktopLinkError({
      version: 2,
      draft: { ...runWorktopDraft(s, 'a'), memberIds: ['a', 'b'] },
    }),
  ).toContain('version 1')
  expect(runWorktopLinkError({ version: 3, draft: d })).toContain('Unsupported')
  expect(
    previewRunWorktop(s, { ...runWorktopDraft(s, 'a'), memberIds: ['a', 'b'] }).part!.runWorktop!
      .version,
  ).toBe(1)
})
it('follows cabinet width, toe height and stock changes; freezes/reports invalid members and recovers', () => {
  const s = add(),
    id = panel(s).id
  cab(s).params.width = 800
  cab(s).params.toeKickHeight = 80
  s.materials['18mm Ply'] = { ...s.materials['18mm Ply'], thickness: 24 }
  const next = regenerateRunWorktops(s)
  expect(panel(next)).toMatchObject({ id, width: 1400, length: 80, thickness: 24 })
  cab(next).position.y = 50
  const frozen = regenerateRunWorktops(next)
  expect(panel(frozen)).toEqual(panel(next))
  expect(runWorktopIssues(frozen, panel(frozen)).join()).toContain('fronts')
  cab(frozen).position.y = 0
  expect(runWorktopIssues(frozen, panel(regenerateRunWorktops(frozen)))).toEqual([])
})
it('preserves independent board data, supports edit/detach/delete and releases all-missing links', () => {
  const s = add()
  panel(s).color = '#123456'
  panel(s).edgeBanding = { x0: null }
  panel(s).visible = false
  const d = { ...panel(s).runWorktop!.draft, heightMode: 'custom' as const, height: '80' }
  const p = previewRunWorktop(s, d, 'panel'),
    next = acceptRunWorktop(s, p, 'unused')!
  expect(panel(next)).toMatchObject({
    id: 'panel',
    color: '#123456',
    visible: false,
    edgeBanding: { x0: null },
    length: 80,
  })
  expect(
    panel(
      acceptRunWorktop(
        next,
        { ...previewRunWorktop(next, d, 'panel'), action: 'detach' },
        'unused',
      )!,
    ).runWorktop,
  ).toBeUndefined()
  expect(
    acceptRunWorktop(
      next,
      { ...previewRunWorktop(next, d, 'panel'), action: 'delete' },
      'unused',
    )!.parts.some((p) => p.id === 'panel'),
  ).toBe(false)
  next.components = []
  expect(panel(regenerateRunWorktops(next)).runWorktop).toBeUndefined()
})
it('rejects stale and unchanged previews and cross-family edits', () => {
  const s = add(),
    d = panel(s).runWorktop!.draft,
    p = previewRunWorktop(s, d, 'panel')
  expect(p.changed).toBe(false)
  expect(acceptRunWorktop(s, p, 'unused')).toBeNull()
  expect(
    previewRunWorktop(
      s,
      { ...runWorktopDraft(s, 'a'), memberIds: ['a', 'b'] },
      'panel',
    ).errors.join(),
  ).toContain('matching run workspace')
  const changed = previewRunWorktop(s, { ...d, label: 'New name' }, 'panel')
  cab(s).position.x = 650
  expect(acceptRunWorktop(s, changed, 'unused')).toBeNull()
})
it.each([validateCurrentFile, validateLegacyFileInput])(
  'round trips vertical links and rejects incompatible machining at a file boundary',
  (validate) => {
    const s = add(),
      f = file(s)
    expect(FILE_FORMAT_VERSION).toBe(37)
    expect(() => validate(f)).not.toThrow()
    expect(panel(parseFile(JSON.stringify(f)).scene).runWorktop).toEqual(panel(s).runWorktop)
    expect(worktopMachiningEligible(panel(s))).toBe(false)
    panel(s).worktopMachining = { version: 1, features: [] }
    expect(() => validate(f)).toThrow('worktopMachining')
  },
)
it('loads v33 projects without inventing vertical recipes', () => {
  const f = file(runPanelScene())
  f.version = 33
  expect(
    parseFile(JSON.stringify(f)).scene.parts.every((p) => p.kind !== 'board' || !p.runWorktop),
  ).toBe(true)
})
it('saves a height-mode change even when its current geometry is identical', () => {
  const s = add(),
    d = { ...panel(s).runWorktop!.draft, heightMode: 'custom' as const, height: '100' }
  const p = previewRunWorktop(s, d, 'panel')
  expect(p.errors).toEqual([])
  expect(p.changed).toBe(true)
  expect(panel(acceptRunWorktop(s, p, 'unused')!).runWorktop!.draft.heightMode).toBe('custom')
})
it('declines incompatible machining on an existing vertical link', () => {
  const s = add()
  panel(s).worktopMachining = { version: 1, features: [] }
  expect(previewRunWorktop(s, panel(s).runWorktop!.draft, 'panel').errors.join()).toContain(
    'Remove worktop machining',
  )
})
it('rejects unknown profiles independently of valid custom-height settings', () => {
  const s = runPanelScene()
  expect(runDraftError({ ...draft(s), profile: 'other', heightMode: 'custom' })).toBe(
    'Choose plinth or splashback.',
  )
})
