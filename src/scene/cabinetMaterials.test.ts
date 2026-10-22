import { describe, expect, it } from 'vitest'
import {
  acceptMaterials,
  cabinetEdgeDirection,
  copyBoardTreatments,
  materialTargets,
  previewMaterials,
  stageEdges,
  stageMaterials,
  type MaterialsDraft,
} from './cabinetMaterials'
import { motionScene } from './__fixtures__/motion'
import { interiorsScene } from './__fixtures__/interiors'
import { runPanelScene } from './__fixtures__/runPanels'
import { applyPipeline } from './pipeline'
import { componentsById } from './componentTree'
import { edgesOf, cutSizeOf } from './edgeBanding'
import { defaultInterior } from './sectionInterior'
import { finishingDraft, previewFinishing, acceptFinishing } from './finishingPanels'
import { runPanelDraft, previewRunWorktop, acceptRunWorktop } from './runWorktops'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import { defaultProject } from './projectStructure'
import { validateCurrentFile } from './fileValidation'
import type { BoardPart, Scene, ZimmuFile } from './types'
function fixture(kind: 'door' | 'drawer' = 'door', frame = false) {
  const s = motionScene(kind, frame)
  s.materials = {
    ...s.materials,
    'Oak 18': { thickness: 18, hasGrain: true },
    'Oak 20': { thickness: 20 },
    'Ply 25': { thickness: 25 },
    'Ply 15': { thickness: 15 },
    'Thin 5': { thickness: 5 },
    'ABS 1': { use: 'edge', thickness: 1 },
    'ABS 2': { use: 'edge', thickness: 2 },
    inherit: { use: 'edge', thickness: 1 },
  }
  return s
}
const board = (s: Scene, role = 'left-side') =>
  s.parts.find((p): p is BoardPart => p.kind === 'board' && p.role === role)!
const checked = (
  s: Scene,
  d: MaterialsDraft,
  mode: 'materials' | 'edges' = 'materials',
  id = 'cab',
) => {
  const p = previewMaterials(s, id, d, mode)
  expect(p.errors).toEqual([])
  expect(p.scene).not.toBeNull()
  return p
}
function envelope(s: Scene): ZimmuFile {
  return {
    version: FILE_FORMAT_VERSION,
    name: 'Materials',
    appVersion: '0',
    units: 'mm',
    createdAt: '2026-10-22',
    updatedAt: '2026-10-22',
    camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
    scene: s,
    project: defaultProject(s, 'materials'),
  }
}
describe('cabinet material ownership and preview', () => {
  it('regenerates dimensions from role material thickness, preserving identity and source', () => {
    const s = fixture(),
      left = board(s),
      bottom = board(s, 'bottom'),
      before = structuredClone(s)
    const d = stageMaterials(s, 'cab', {}, [left.id], { material: 'Ply 25', grain: 'width' })
    const p = checked(s, d),
      next = p.scene!
    expect(board(next).thickness).toBe(25)
    expect(board(next).grain).toBe('width')
    expect(board(next, 'bottom').length).toBe(bottom.length - 7)
    expect(board(next).id).toBe(left.id)
    expect(s).toEqual(before)
    expect(p.changed).toBe(true)
    expect(board(applyPipeline(next)).overrides).toEqual({ material: 'Ply 25', grain: 'width' })
    expect(board(applyPipeline(next)).grain).toBe('width')
  })
  it('restores inherited material and grain without clearing independent thickness ownership', () => {
    const s = fixture(),
      left = board(s)
    left.overrides = { material: 'Ply 25', grain: 'free', thickness: 21 }
    const baseline = applyPipeline(s)
    const p = checked(
      baseline,
      stageMaterials(baseline, 'cab', {}, [left.id], { material: null, grain: null }),
    )
    expect(board(p.scene!).overrides).toEqual({ thickness: 21 })
    expect(board(p.scene!).material).toBe('18mm Ply')
    expect(board(p.scene!).thickness).toBe(21)
    expect(board(p.scene!).grain).toBe(left.grain)
  })
  it('expands drawer material assignments to all five boards using drawer parameters', () => {
    const s = fixture('drawer'),
      p = s.parts.find((p) => p.role === 'box-left')!
    expect(() =>
      stageMaterials(s, 'cab', {}, [p.id], { material: 'Ply 15', grain: 'width' }),
    ).not.toThrow()
    const d = stageMaterials(s, 'cab', {}, [p.id], { material: 'Ply 15', grain: 'width' })
    expect(Object.keys(d)).toHaveLength(5)
    const next = checked(s, d).scene!,
      drawer = next.components.find((c) => c.kind === 'drawer')!
    expect(drawer.kind === 'drawer' && drawer.params.material).toBe('Ply 15')
    expect(
      next.parts.filter((p) => p.parentId === drawer.id).every((p) => p.material === 'Ply 15'),
    ).toBe(true)
    expect(next.parts.find((b) => b.id === p.id)).toMatchObject({
      grain: 'width',
      overrides: { grain: 'width' },
    })
    expect(
      checked(
        next,
        stageMaterials(next, 'cab', {}, [p.id], { material: null }),
      ).scene!.components.find((c) => c.kind === 'drawer'),
    ).toMatchObject({ params: { material: '' } })
  })
  it('includes newly regenerated drawer boards in quantities and comparisons', () => {
    const s = fixture('drawer'),
      left = board(s)
    s.parts = s.parts.filter((p) => !p.role?.startsWith('box-'))
    const p = checked(s, stageMaterials(s, 'cab', {}, [left.id], { grain: 'width' }))
    expect(p.rows).toHaveLength(materialTargets(p.scene!, 'cab').length)
    expect(p.rows.filter((r) => !r.before)).toHaveLength(5)
  })
  it('rejects a forged partial drawer material assignment and detached drawer members', () => {
    const s = fixture('drawer'),
      p = board(s, 'box-left')
    expect(
      previewMaterials(s, 'cab', { [p.id]: { material: 'Ply 15' } }, 'materials').errors.join(),
    ).toContain('complete driven drawer box')
    board(s, 'box-right').driven = false
    expect(() => stageMaterials(s, 'cab', {}, [p.id], { material: 'Ply 15' })).toThrow(/detached/)
  })
  it('keeps face-frame material and grain ownership through shared board reconciliation', () => {
    const s = fixture('door', true),
      p = board(s, 'stile-left')
    const d = stageMaterials(s, 'cab', {}, [p.id], { material: 'Oak 20', grain: 'width' })
    const after = checked(s, d).scene!
    expect(board(applyPipeline(after), 'stile-left')).toMatchObject({
      material: 'Oak 20',
      grain: 'width',
    })
    expect(
      previewMaterials(s, 'cab', { [p.id]: { material: 'Ply 25' } }, 'materials').errors.join(),
    ).toContain('retain the current thickness')
  })
  it('updates fixed and adjustable shelves and reports their opening', () => {
    let s = interiorsScene()
    const c = s.components.find((c) => c.kind === 'carcase')!
    if (c.kind !== 'carcase') throw Error('cabinet')
    c.params.section.interior = defaultInterior(1)
    c.params.section.interior.fixedShelves = 1
    s.materials['Oak 18'] = { thickness: 18 }
    s = applyPipeline(s)
    const targets = materialTargets(s, 'cab').filter((t) => /shelves/.test(t.family))
    expect(targets).toHaveLength(2)
    expect(targets.every((t) => t.opening === 'Opening 1')).toBe(true)
    const next = checked(
      s,
      stageMaterials(
        s,
        'cab',
        {},
        targets.map((t) => t.board.id),
        { material: 'Oak 18' },
      ),
    ).scene!
    expect(
      targets.every((t) => next.parts.find((p) => p.id === t.board.id)?.material === 'Oak 18'),
    ).toBe(true)
  })
  it('preserves linked finishing recipe and custom thickness while changing stock and grain', () => {
    let s = fixture()
    const d = {
      ...finishingDraft(s, 'cab'),
      follow: true,
      thicknessMode: 'custom' as const,
      thickness: '30',
    }
    s = acceptFinishing(s, previewFinishing(s, 'cab', d), 'finish')!
    const next = checked(
      s,
      stageMaterials(s, 'cab', {}, ['finish'], { material: 'Oak 18', grain: 'width' }),
    ).scene!
    const p = next.parts.find((p) => p.id === 'finish') as BoardPart
    expect(p).toMatchObject({
      material: 'Oak 18',
      thickness: 30,
      grain: 'width',
      finishing: { draft: { material: 'Oak 18', thicknessMode: 'custom', grain: 'width' } },
    })
    expect(
      (applyPipeline(next).parts.find((p) => p.id === 'finish') as BoardPart).finishing,
    ).toEqual(p.finishing)
  })
  it('includes shared run panels and updates their recipes without releasing membership', () => {
    let s = runPanelScene()
    s.materials['Oak 18'] = { thickness: 18 }
    const d = { ...runPanelDraft(s, 'a'), memberIds: ['a', 'b'] }
    s = acceptRunWorktop(s, previewRunWorktop(s, d), 'run')!
    expect(materialTargets(s, 'a').find((t) => t.board.id === 'run')?.shared).toBe(true)
    expect(materialTargets(s, 'b').find((t) => t.board.id === 'run')?.shared).toBe(true)
    const p = checked(
      s,
      stageMaterials(s, 'a', {}, ['run'], { material: 'Oak 18', grain: 'free' }),
      'materials',
      'a',
    )
    expect(p.scene!.parts.find((p) => p.id === 'run')).toMatchObject({
      material: 'Oak 18',
      grain: 'free',
      runWorktop: { draft: { memberIds: ['a', 'b'], material: 'Oak 18' } },
    })
  })
  it('copies staged material and grain without copying ownership identities', () => {
    const s = fixture(),
      left = board(s),
      right = board(s, 'right-side')
    const d = stageMaterials(s, 'cab', {}, [left.id], { material: 'Oak 18', grain: 'free' })
    const p = checked(s, copyBoardTreatments(s, 'cab', d, left.id, [right.id], 'materials'))
    expect(board(p.scene!, 'right-side')).toMatchObject({
      id: right.id,
      material: 'Oak 18',
      grain: 'free',
    })
  })
  it('rejects unsupported stock, grain, mode and geometry loss', () => {
    const s = fixture(),
      p = board(s)
    for (const material of ['Missing', 'ABS 1'])
      expect(
        previewMaterials(s, 'cab', { [p.id]: { material } }, 'materials').errors.join(),
      ).toContain('panel material')
    expect(
      previewMaterials(s, 'cab', { [p.id]: { grain: 'bad' as never } }, 'materials').errors.join(),
    ).toContain('grain')
    expect(
      previewMaterials(s, 'cab', { [p.id]: { edges: { x0: null } } }, 'materials').errors.join(),
    ).toContain('matching')
    s.materials.Huge = { thickness: 600 }
    expect(
      previewMaterials(s, 'cab', { [p.id]: { material: 'Huge' } }, 'materials').errors.length,
    ).toBeGreaterThan(0)
  })
  it.each([false, true])(
    'blocks doors that lose hinge fit after changing material thickness (frame=%s)',
    (frame) => {
      const s = fixture('door', frame),
        door = s.parts.find((p) => p.role?.startsWith('front-'))!
      expect(
        previewMaterials(
          s,
          'cab',
          { [door.id]: { material: 'Thin 5' } },
          'materials',
        ).errors.join(),
      ).toMatch(/hinge|front|thick/i)
    },
  )
  it('protects a detached face frame as well as individually detached boards', () => {
    const s = fixture('door', true),
      p = board(s, 'stile-left')
    const frame = s.components.find((c) => c.kind === 'faceFrame')!
    if (frame.kind !== 'faceFrame') throw Error('frame')
    frame.driven = false
    expect(materialTargets(s, 'cab').find((t) => t.board.id === p.id)?.locked).toBe(true)
    expect(
      previewMaterials(s, 'cab', { [p.id]: { grain: 'width' } }, 'materials').errors.join(),
    ).toContain('detached')
  })
  it('rejects a linked panel proposal when its recipe cannot rebuild', () => {
    let s = fixture()
    const d = { ...finishingDraft(s, 'cab', 'plinth'), follow: true }
    s = acceptFinishing(s, previewFinishing(s, 'cab', d), 'plinth')!
    expect(s).not.toBeNull()
    s.materials.Huge = { thickness: 1000 }
    expect(
      previewMaterials(s, 'cab', { plinth: { material: 'Huge' } }, 'materials').errors.length,
    ).toBeGreaterThan(0)
  })
  it('rejects material and grain inheritance on manual boards and validates their dimensions', () => {
    const s = fixture(),
      left = board(s)
    s.parts.push({ ...structuredClone(left), id: 'manual', driven: false, role: undefined })
    expect(
      previewMaterials(s, 'cab', { manual: { material: null } }, 'materials').errors.join(),
    ).toContain('no inherited material')
    expect(
      previewMaterials(s, 'cab', { manual: { grain: null } }, 'materials').errors.join(),
    ).toContain('no inherited grain')
    s.parts.find((p) => p.id === 'manual')!.length = 0
    expect(
      previewMaterials(s, 'cab', { [left.id]: { grain: 'width' } }, 'materials').errors.join(),
    ).toContain('dimensions must be positive')
  })
  it('locks detached role boards and rejects unavailable or repeated selections', () => {
    const s = fixture(),
      p = board(s)
    p.driven = false
    expect(materialTargets(s, 'cab').find((t) => t.board.id === p.id)?.locked).toBe(true)
    expect(() => stageMaterials(s, 'cab', {}, [p.id], { grain: 'width' })).toThrow(/detached/)
    expect(() => stageMaterials(s, 'cab', {}, [], { grain: 'free' })).toThrow(/distinct/)
    expect(() => stageMaterials(s, 'cab', {}, ['missing'], { grain: 'free' })).toThrow(
      /unavailable/,
    )
    expect(() => stageMaterials(s, 'cab', {}, [p.id, p.id], { grain: 'free' })).toThrow(/distinct/)
  })
  it('rejects stale and unchanged proposals and recomputes a tampered cached scene', () => {
    const s = fixture(),
      d = stageMaterials(s, 'cab', {}, [board(s).id], { grain: 'width' }),
      p = checked(s, d)
    const altered = structuredClone(s)
    altered.materials['Oak 18'].thickness = 19
    expect(acceptMaterials(altered, p)).toBeNull()
    expect(acceptMaterials(s, checked(s, {}))).toBeNull()
    p.scene!.parts = []
    expect(acceptMaterials(s, p)?.parts.length).toBe(s.parts.length)
    expect(acceptMaterials(s, { ...p, draft: { missing: { grain: 'width' } } })).toBeNull()
  })
})
describe('cabinet edgebanding and manufacturing data', () => {
  it('maps cabinet-front edges correctly through a rotated cabinet and container', () => {
    const s = fixture(),
      c = s.components.find((c) => c.id === 'cab')!
    c.rotation.z = 37
    c.parentId = 'g'
    s.components.push({
      kind: 'group',
      id: 'g',
      label: 'Room',
      parentId: null,
      position: { x: 90, y: 45, z: 0 },
      rotation: { x: 0, y: 0, z: 90 },
      rotationOrder: 'XYZ',
      visible: true,
    })
    const left = board(s),
      right = board(s, 'right-side')
    expect(cabinetEdgeDirection(s, 'cab', left, 'x0')).toBe('front')
    const d = stageEdges(s, 'cab', {}, [left.id, right.id], [], 'ABS 1', false, true, 'front')
    const p = checked(s, d, 'edges')
    for (const part of [left, right]) {
      const after = p.scene!.parts.find((p) => p.id === part.id) as BoardPart
      expect(Object.entries(after.edgeBanding!)).toHaveLength(1)
      const edge = Object.keys(after.edgeBanding!)[0] as 'x0'
      expect(cabinetEdgeDirection(s, 'cab', part, edge)).toBe('front')
    }
  })
  it('protects existing explicit edges and can deliberately replace, clear and restore inheritance', () => {
    const s = fixture(),
      p = board(s)
    p.edgeBanding = { x0: 'ABS 1', x1: null }
    const protectedDraft = stageEdges(s, 'cab', {}, [p.id], ['x0', 'x1', 'y0'], 'ABS 2')
    expect(protectedDraft[p.id].edges).toEqual({ y0: 'ABS 2' })
    const changed = checked(
      s,
      stageEdges(s, 'cab', {}, [p.id], ['x0'], null, false, false),
      'edges',
    ).scene!
    expect(board(changed).edgeBanding).toEqual({ x0: null, x1: null })
    const inherited = checked(
      s,
      stageEdges(s, 'cab', {}, [p.id], ['x0'], null, true, false),
      'edges',
    ).scene!
    expect(board(inherited).edgeBanding).toEqual({ x1: null })
  })
  it('derives exact edge lengths and cut sizes from accepted decisions', () => {
    const s = fixture(),
      p = board(s)
    const d = stageEdges(s, 'cab', {}, [p.id], [], 'ABS 1', false, true, 'perimeter')
    const proposal = checked(s, d, 'edges'),
      next = acceptMaterials(s, proposal)!,
      after = board(next)
    const effective = edgesOf(after, componentsById(next.components), next.materials)
    expect(cutSizeOf(after, effective, next.materials)).toEqual({
      length: p.length - 2,
      width: p.width - 2,
      thickness: p.thickness,
    })
    expect(proposal.totals).toEqual([
      { material: 'ABS 1', before: 0, after: 2 * (p.length + p.width) },
    ])
    expect(board(applyPipeline(next)).edgeBanding).toEqual(after.edgeBanding)
  })
  it('does not confuse a stock named inherit with the inheritance action', () => {
    const s = fixture(),
      p = board(s)
    const next = checked(s, stageEdges(s, 'cab', {}, [p.id], ['y0'], 'inherit'), 'edges').scene!
    expect(board(next).edgeBanding).toEqual({ y0: 'inherit' })
  })
  it('copies effective treatments only between matching size and oriented boards', () => {
    const s = fixture(),
      left = board(s),
      right = board(s, 'right-side'),
      bottom = board(s, 'bottom')
    left.edgeBanding = { x0: 'ABS 1' }
    const p = checked(s, copyBoardTreatments(s, 'cab', {}, left.id, [right.id], 'edges'), 'edges')
    expect(board(p.scene!, 'right-side').edgeBanding).toMatchObject({ x0: 'ABS 1' })
    expect(() => copyBoardTreatments(s, 'cab', {}, left.id, [bottom.id], 'edges')).toThrow(
      /matching/,
    )
  })
  it('rejects copying to a board that differs only in length', () => {
    const s = fixture(),
      left = board(s)
    s.parts.push({
      ...structuredClone(left),
      id: 'short-manual',
      role: undefined,
      driven: false,
      length: left.length - 10,
    })
    expect(() => copyBoardTreatments(s, 'cab', {}, left.id, ['short-manual'], 'edges')).toThrow(
      /matching/,
    )
  })
  it('compares actual orientation when both edge labels are angled', () => {
    const s = fixture(),
      base = board(s)
    const a = {
      ...structuredClone(base),
      id: 'angled-a',
      role: undefined,
      driven: false,
      rotation: { x: 0, y: 0, z: 20 },
    }
    const b = { ...structuredClone(a), id: 'angled-b', rotation: { x: 0, y: 0, z: 30 } }
    s.parts.push(a, b)
    expect(() => copyBoardTreatments(s, 'cab', {}, a.id, [b.id], 'edges')).toThrow(/orientation/)
    b.rotation.z = 20
    expect(() => copyBoardTreatments(s, 'cab', {}, a.id, [b.id], 'edges')).not.toThrow()
  })
  it('rejects missing, panel, nonpositive and oversized tape stock', () => {
    const s = fixture(),
      p = board(s)
    s.materials.Zero = { use: 'edge', thickness: 0 }
    s.materials.Thick = { use: 'edge', thickness: 1000 }
    for (const name of ['Missing', 'Oak 18', 'Zero'])
      expect(
        previewMaterials(s, 'cab', { [p.id]: { edges: { x0: name } } }, 'edges').errors.join(),
      ).toContain('edge-band material')
  })
  it('rejects tape subtraction that leaves no positive cut size', () => {
    const s = fixture(),
      p = board(s)
    s.materials.Thick = { use: 'edge', thickness: 1000 }
    expect(
      previewMaterials(s, 'cab', { [p.id]: { edges: { x0: 'Thick' } } }, 'edges').errors.join(),
    ).toContain('cut size')
  })
  it('flags missing inherited tape and rejects mitred or nonexistent edge treatments', () => {
    const s = fixture(),
      p = board(s),
      c = s.components.find((c) => c.kind === 'carcase')!
    if (c.kind !== 'carcase') throw Error('cabinet')
    c.params.edgeMaterial = 'Missing'
    expect(previewMaterials(s, 'cab', {}, 'edges').errors.join()).toContain('edge-band material')
    delete c.params.edgeMaterial
    expect(
      previewMaterials(
        s,
        'cab',
        { [p.id]: { edges: { wrong: null } as never } },
        'edges',
      ).errors.join(),
    ).toContain('valid board edges')
    p.cuts.push({ kind: 'mitre' } as never)
    expect(() => stageEdges(s, 'cab', {}, [p.id], ['x0'], null)).toThrow(/Mitred/)
  })
  it('rejects invalid modes, nonpositive dimensions, and too many staged boards', () => {
    const s = fixture(),
      p = board(s)
    expect(
      previewMaterials(s, 'cab', { [p.id]: { material: 'Oak 18' } }, 'edges').errors.join(),
    ).toContain('matching')
    expect(
      previewMaterials(
        s,
        'cab',
        Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [String(i), {}])),
        'edges',
      ).errors.join(),
    ).toContain('Stage at most 1000')
    expect(previewMaterials(s, 'missing', {}, 'edges').errors.join()).toContain('cabinet')
    expect(() => stageEdges(s, 'cab', {}, [p.id], [], 'ABS 1')).toThrow(/Choose edges/)
  })
})
describe('material/grain and edge persistence', () => {
  it('round trips owned grain and explicit/inherited/bare edges, then regenerates', () => {
    const s = fixture(),
      p = board(s)
    const a = checked(
      s,
      stageMaterials(s, 'cab', {}, [p.id], { material: 'Oak 18', grain: 'width' }),
    ).scene!
    const b = checked(a, stageEdges(a, 'cab', {}, [p.id], ['x0'], 'ABS 1'), 'edges').scene!
    const c = checked(b, stageEdges(b, 'cab', {}, [p.id], ['x1'], null), 'edges').scene!
    const reopened = applyPipeline(parseFile(JSON.stringify(envelope(c))).scene)
    expect(board(reopened)).toMatchObject({
      material: 'Oak 18',
      grain: 'width',
      overrides: { material: 'Oak 18', grain: 'width' },
      edgeBanding: { x0: 'ABS 1', x1: null },
    })
    expect(FILE_FORMAT_VERSION).toBe(39)
  })
  it('rejects malformed grain ownership at raw and current file boundaries', () => {
    const s = fixture(),
      p = board(s)
    p.overrides = { grain: 'diagonal' as never }
    const f = envelope(s)
    expect(() => parseFile(JSON.stringify(f))).toThrow(/overrides.grain/)
    expect(() => validateCurrentFile(f)).toThrow(/overrides.grain/)
  })
})
