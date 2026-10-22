import { expect, it } from 'vitest'
import { grainFixture } from './__fixtures__/grainMatch'
import {
  grainMatchLayout,
  previewGrainMatch,
  acceptGrainMatch,
  regenerateGrainMatches,
  grainMatchIssues,
  grainFronts,
} from './grainMatching'
import { grainMatchDraftError, grainMatchesError, grainMatchBindingError } from './grainMatchRecipe'
import { applyPipeline } from './pipeline'
import { manufacturingParts } from './manufacturingPart'
import { manufacturingLabels } from './manufacturingLabels'
import { groupByNestableMaterial, jobSignature } from './useNest'
import { nestJob, matchedGroupProblem, type NestBoard } from '../nest/nestJob'
import { buildSheetSvg } from '../ui/buildSheetSvg'
import { buildGrainMatchCsv } from '../ui/buildGrainMatchCsv'
import { stageMaterials } from './cabinetMaterials'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import { validateCurrentFile, validateLegacyFileInput } from './fileValidation'
import type { BoardPart, CarcaseComponent, Scene, ZimmuFile } from './types'
const group = (f = grainFixture()) => ({ version: 1 as const, id: 'group', draft: f.draft })
const accepted = (f = grainFixture()) =>
  acceptGrainMatch(f.scene, f.project, previewGrainMatch(f.scene, f.project, f.draft), 'group')!
const boards = (s: Scene) =>
  s.parts.filter((p): p is BoardPart => p.kind === 'board' && !!p.grainMatch)
const nestBoards = (s: Scene): NestBoard[] =>
  manufacturingParts(s.parts, s.materials, s.components).flatMap((p) =>
    p.kind === 'board' && p.grainMatch
      ? [{ kind: 'board', id: p.id, grain: p.grain, ...p.nesting, grainMatch: p.grainMatch }]
      : [],
  )
it('derives absolute paired-front cut positions, sequence and shared blank dimensions', () => {
  const f = grainFixture(),
    before = JSON.stringify(f.scene),
    p = previewGrainMatch(f.scene, f.project, f.draft)
  expect(p.errors).toEqual([])
  expect(p.layout).not.toBeNull()
  expect(p.layout!.blankWidth).toBe(632)
  expect(p.layout!.blankHeight).toBe(738)
  expect(p.layout!.panels.map((p) => [p.x, p.y, p.width, p.height, p.sequence])).toEqual([
    [10, 10, 298, 718, 1],
    [324, 10, 298, 718, 2],
  ])
  expect(JSON.stringify(f.scene)).toBe(before)
  const s = accepted(f)
  expect(boards(s).map((p) => p.grain)).toEqual(['length', 'length'])
  expect(s.parts.map((p) => p.position)).toEqual(f.scene.parts.map((p) => p.position))
})
it.each(['stack', 'mixed'] as const)(
  'supports %s layouts with top-to-bottom sequencing and horizontal grain',
  (kind) => {
    const f = grainFixture(kind)
    f.draft.direction = 'horizontal'
    const p = previewGrainMatch(f.scene, f.project, f.draft)
    expect(p.errors).toEqual([])
    expect(p.layout!.panels).toHaveLength(2)
    expect(p.layout!.panels[0].installedY).toBe(0)
    expect(p.layout!.panels[1].installedY).toBeGreaterThan(0)
    expect(p.layout!.panels[1].y - p.layout!.panels[0].y).toBeCloseTo(
      p.layout!.panels[1].installedY + 14,
    )
    expect(boards(p.scene!).every((p) => p.grain === 'width')).toBe(true)
  },
)
it('uses reference pattern origins and signed offsets without changing cut coordinates', () => {
  const f = grainFixture(),
    a = grainMatchLayout(f.scene, group(f)),
    d = {
      ...f.draft,
      origin: 'reference' as const,
      referenceId: f.fronts[1].id,
      offsetX: -25,
      offsetY: 30,
    },
    b = grainMatchLayout(f.scene, { ...group(f), draft: d })
  expect(b.panels).toEqual(a.panels)
  const ref = b.panels.find((p) => p.id === d.referenceId)!
  expect(b.patternX).toBe(ref.x - 25)
  expect(b.patternY).toBe(ref.y + 30)
})
it('deducts each board-local band from the correct physical cut edge', () => {
  const f = grainFixture()
  f.scene.materials.Tape = { thickness: 2, use: 'edge' }
  for (const t of f.fronts) t.part.edgeBanding = { x0: 'Tape', x1: 'Tape', y0: 'Tape', y1: 'Tape' }
  const layout = grainMatchLayout(f.scene, group(f))
  expect(layout.panels[0]).toMatchObject({
    x: 12,
    y: 12,
    width: 294,
    height: 714,
    sourceX: 10,
    sourceY: 10,
  })
  expect(layout.blankWidth).toBe(630)
  expect(layout.blankHeight).toBe(736)
})
it('preserves the solve through shared rotated/translated parents and across compatible cabinets', () => {
  const f = grainFixture(),
    c = f.scene.components[0] as CarcaseComponent
  c.parentId = 'room'
  f.scene.components.push({
    kind: 'group',
    id: 'room',
    label: 'Room',
    parentId: null,
    position: { x: 1000, y: 2000, z: 50 },
    rotation: { x: 0, y: 0, z: 90 },
    rotationOrder: 'XYZ',
    visible: true,
  })
  expect(grainMatchLayout(f.scene, group(f)).blankWidth).toBe(632)
  const next = structuredClone(c)
  next.id = 'cab2'
  next.position.x = 600
  f.scene.components.push(next)
  f.scene = applyPipeline(f.scene)
  f.draft.memberIds = grainFronts(f.scene).map((t) => t.id)
  const layout = grainMatchLayout(f.scene, group(f))
  expect(layout.panels).toHaveLength(4)
  expect(layout.blankWidth).toBe(1260)
})
it('rejects facing/plane/material/thickness mismatches and unsupported sources', () => {
  const f = grainFixture(),
    a = f.fronts[0].part,
    b = f.fronts[1].part
  b.thickness = 19
  expect(() => grainMatchLayout(f.scene, group(f))).toThrow('same thickness')
  b.thickness = 18
  b.material = 'Other'
  expect(() => grainMatchLayout(f.scene, group(f))).toThrow(/same material|missing/)
  b.material = a.material
  b.position.y = 20
  expect(() => grainMatchLayout(f.scene, group(f))).toThrow('plane')
  b.position.y = a.position.y
  b.driven = false
  expect(() => grainMatchLayout(f.scene, group(f))).toThrow('Detached')
  b.driven = true
  f.scene.components[0].rotation.x = 5
  expect(() => grainMatchLayout(f.scene, group(f))).toThrow('upright')
})
it('rejects incompatible cabinet directions, overlapping fronts and invalid edge stock', () => {
  const f = grainFixture(),
    c = structuredClone(f.scene.components[0]) as CarcaseComponent
  c.id = 'other'
  c.position.x = 600
  c.rotation.z = 180
  f.scene.components.push(c)
  f.scene = applyPipeline(f.scene)
  f.draft.memberIds = grainFronts(f.scene).map((t) => t.id)
  expect(() => grainMatchLayout(f.scene, group(f))).toThrow('same direction')
  const overlap = grainFixture()
  overlap.fronts[1].part.position.x = overlap.fronts[0].part.position.x
  expect(() => grainMatchLayout(overlap.scene, group(overlap))).toThrow('overlap')
  const edge = grainFixture()
  edge.scene.materials.Bad = { thickness: -1, use: 'edge' }
  edge.fronts[0].part.edgeBanding = { x0: 'Bad' }
  expect(() => grainMatchLayout(edge.scene, group(edge))).toThrow('positive thickness')
})
it('refreshes dimensions and grain after resizing, diagnoses broken links and preserves grain on detach', () => {
  const f = grainFixture(),
    s = accepted(f),
    c = s.components[0] as CarcaseComponent
  c.params.width = 800
  const resized = applyPipeline(s)
  expect(boards(resized)[0].grainMatch!.blankWidth).toBe(832)
  expect(applyPipeline(resized)).toEqual(resized)
  const missing = { ...resized, parts: resized.parts.filter((p) => p.id !== f.draft.memberIds[0]) },
    broken = regenerateGrainMatches(missing)
  expect(boards(broken)[0].grainMatch!.problem).toContain('missing')
  expect(grainMatchIssues(broken, broken.grainMatches![0]).join(' ')).toContain('missing')
  const request = {
      ...previewGrainMatch(broken, f.project, f.draft, 'group'),
      action: 'detach' as const,
    },
    detached = acceptGrainMatch(broken, f.project, request, 'unused')!
  expect(detached.grainMatches).toBeUndefined()
  expect(boards(detached)).toEqual([])
  expect(
    detached.parts.find((p): p is BoardPart => p.kind === 'board' && p.id === f.draft.memberIds[1])!
      .grain,
  ).toBe('length')
})
it('rejects competing membership, stale requests, no-ops, ID collisions and forged preview geometry', () => {
  const f = grainFixture(),
    p = previewGrainMatch(f.scene, f.project, f.draft),
    s = accepted(f)
  expect(previewGrainMatch(s, f.project, f.draft).errors.join(' ')).toContain('another grain group')
  const request = previewGrainMatch(
    s,
    f.project,
    { ...f.draft, memberIds: [...f.draft.memberIds].reverse() },
    'group',
  )
  expect(request.changed).toBe(false)
  expect(acceptGrainMatch(s, f.project, request, 'unused')).toBeNull()
  for (const id of ['', f.scene.parts[0].id, 'cab'])
    expect(acceptGrainMatch(f.scene, f.project, p, id)).toBeNull()
  f.project.areas[0].name = 'Changed'
  expect(acceptGrainMatch(f.scene, f.project, p, 'next')).toBeNull()
  const fresh = previewGrainMatch(f.scene, f.project, f.draft)
  fresh.scene = { ...f.scene, parts: [] }
  expect(acceptGrainMatch(f.scene, f.project, fresh, 'next')!.parts.length).toBe(
    f.scene.parts.length,
  )
})
it('rejects ordinary grouped-grain edits and clears orphan bindings without losing independent grain', () => {
  const f = grainFixture(),
    s = accepted(f),
    p = boards(s)[0]
  expect(() => stageMaterials(s, 'cab', {}, [p.id], { grain: 'free' })).toThrow(
    'Front Grain Matching',
  )
  const detached = regenerateGrainMatches({ ...s, grainMatches: [] })
  expect(boards(detached)).toEqual([])
  expect(
    detached.parts.find((q): q is BoardPart => q.kind === 'board' && q.id === p.id)!.grain,
  ).toBe('length')
})
it('nests one complete blank, expands real member identities and labels without counting gap waste as material', () => {
  const f = grainFixture(),
    s = accepted(f),
    members = nestBoards(s),
    result = nestJob({
      parts: members,
      clearance: 14,
      sheet: { length: 2440, width: 1220 },
      hasGrain: true,
    })
  expect(result.unplaced).toEqual([])
  expect(result.blanks).toHaveLength(1)
  expect(result.sheets).toHaveLength(1)
  expect(result.sheets[0].map((p) => p.id).sort()).toEqual(members.map((p) => p.id).sort())
  expect(result.sheets[0].every((p) => p.rotation === 0)).toBe(true) // vertical group turns 90; member 270 + 90 = 0
  expect(result.sheets[0][1].y - result.sheets[0][0].y).toBe(314)
  expect(result.utilisation[0]).toBeCloseTo((2 * 298 * 718) / (2440 * 1220))
  const records = manufacturingParts(s.parts, s.materials, s.components),
    labels = manufacturingLabels(records)
  expect(labels.get(members[0].id)!.detail).toContain('Sequence 1/2')
  const svg = buildSheetSvg(
    { length: 2440, width: 1220 },
    result.sheets[0],
    (id) => labels.get(id)!.text,
    600,
    labels,
    result.blanks,
  )
  expect(svg).toContain('data-grain-group="group"')
  expect(svg).toContain('Sequence 1/2')
  const csv = buildGrainMatchCsv(records)
  expect(csv).toContain('Board rotation in blank (deg)')
  expect(csv).toContain('"group","Matched fronts","1","2"')
})
it('fits only atomic groups and never scatters a group whose blank exceeds stock', () => {
  const s = accepted(),
    parts = nestBoards(s),
    result = nestJob({ parts, clearance: 0, sheet: { length: 720, width: 300 }, hasGrain: true })
  expect(result.sheets).toEqual([])
  expect(result.unplaced.sort()).toEqual(parts.map((p) => p.id).sort())
  expect(result.matchProblems![0].message).toContain('complete matched blank')
})
it('rejects incomplete groups, inconsistent metadata, incompatible grain, insufficient gaps and bad stock', () => {
  const parts = nestBoards(accepted()),
    sheet = { length: 2440, width: 1220 }
  expect(matchedGroupProblem(parts.slice(0, 1), 14, sheet, true)).toContain('complete')
  const duplicate = structuredClone(parts)
  duplicate[1].grainMatch!.sequence = 1
  expect(matchedGroupProblem(duplicate, 14, sheet, true)).toContain('complete')
  for (const mutate of [
    (p: NestBoard) => {
      p.grainMatch!.blankWidth += 1
    },
    (p: NestBoard) => {
      p.width += 1
    },
    (p: NestBoard) => {
      p.grain = 'free'
    },
    (p: NestBoard) => {
      p.thickness += 1
    },
  ]) {
    const broken = structuredClone(parts)
    mutate(broken[1])
    expect(matchedGroupProblem(broken, 14, sheet, true)).toContain('disagree')
  }
  expect(matchedGroupProblem(parts, 30, sheet, true)).toContain('cutting gaps')
  expect(matchedGroupProblem(parts, NaN, sheet, true)).toContain('finite')
  expect(matchedGroupProblem(parts, 14, { length: 0, width: 100 }, true)).toContain('positive')
  const s = accepted()
  s.parts = s.parts.filter((p) => p.id !== boards(s)[0].id)
  const broken = regenerateGrainMatches(s)
  expect(
    nestJob({ parts: nestBoards(broken), clearance: 0, sheet, hasGrain: true }).sheets,
  ).toEqual([])
})
it('preflights very large blanks and uses safe synthetic identities', () => {
  const parts = nestBoards(accepted())
  parts.forEach((p) => {
    p.grainMatch!.blankWidth = 100000
    p.grainMatch!.blankHeight = 100000
  })
  const result = nestJob({
    parts,
    clearance: 14,
    sheet: { length: 100, width: 100 },
    hasGrain: true,
  })
  expect(result.unplaced).toHaveLength(2)
  const normal = nestBoards(accepted()),
    plain = { ...normal[0], id: 'grain-blank:group', grainMatch: undefined }
  const both = nestJob({
    parts: [...normal, plain],
    clearance: 14,
    sheet: { length: 2440, width: 1220 },
    hasGrain: true,
  })
  expect(
    both.sheets
      .flat()
      .map((p) => p.id)
      .sort(),
  ).toEqual([...normal.map((p) => p.id), plain.id].sort())
})
it('encodes bindings in worker signatures and preserves plain jobs without optional result fields', () => {
  const f = grainFixture(),
    s = accepted(f),
    groups = groupByNestableMaterial(s.parts, s.materials, s.components),
    before = jobSignature(groups, 14)
  const clone = structuredClone(groups)
  clone
    .find((g) => g.material === f.material)!
    .parts.find((p) => p.grainMatch)!.grainMatch!.patternX += 1
  expect(jobSignature(clone, 14)).not.toBe(before)
  const p = nestBoards(s)[0],
    plain = { ...p, grainMatch: undefined },
    result = nestJob({
      parts: [plain],
      clearance: 0,
      sheet: { length: 1000, width: 1000 },
      hasGrain: true,
    })
  expect(result.blanks).toBeUndefined()
  expect(result.matchProblems).toBeUndefined()
  expect(result.sheets.flat()).toHaveLength(1)
})
it('roundtrips format 42 with structural validators and restores derived bindings on reload', () => {
  const f = grainFixture(),
    scene = accepted(f),
    raw = {
      version: FILE_FORMAT_VERSION,
      name: 'Grain',
      appVersion: '0',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      scene,
      project: f.project,
      camera: { position: { x: 0, y: 0, z: 1000 }, target: { x: 0, y: 0, z: 0 } },
    } as ZimmuFile
  expect(FILE_FORMAT_VERSION).toBe(42)
  const parsed = parseFile(JSON.stringify(raw))
  expect(parsed.scene.grainMatches).toEqual(scene.grainMatches)
  expect(boards(applyPipeline(parsed.scene))).toHaveLength(2)
  for (const validate of [validateCurrentFile, validateLegacyFileInput]) {
    const bad = structuredClone(raw)
    bad.scene.grainMatches![0].draft.gap = NaN
    expect(() => validate(bad)).toThrow('grainMatches')
    const binding = structuredClone(raw)
    boards(binding.scene)[0].grainMatch!.sequence = 0
    expect(() => validate(binding)).toThrow('grainMatch')
  }
  const older = structuredClone(raw)
  older.version = 39
  delete older.scene.grainMatches
  older.scene.parts = older.scene.parts.map((p) =>
    p.kind === 'board' ? { ...p, grainMatch: undefined } : p,
  )
  expect(parseFile(JSON.stringify(older)).scene.grainMatches).toBeUndefined()
})
it('validates recipe ownership and derived binding geometry without requiring live front references', () => {
  const f = grainFixture(),
    g = group(f)
  expect(grainMatchesError([g])).toBeNull()
  expect(grainMatchesError([g, { ...g, id: 'other' }])).toContain('unique')
  expect(
    grainMatchesError(Array.from({ length: 51 }, (_, i) => ({ ...g, id: String(i) }))),
  ).toContain('50')
  const b = boards(accepted(f))[0].grainMatch!
  expect(grainMatchBindingError(b)).toBeNull()
  expect(grainMatchBindingError({ ...b, x: -1 })).toContain('negative')
  expect(grainMatchBindingError({ ...b, sequence: 0 })).toContain('sequence')
  expect(grainMatchBindingError({ ...b, width: b.blankWidth + 1 })).toContain('fit')
  expect(
    grainMatchBindingError({
      ...b,
      width: 0,
      height: 0,
      blankWidth: 0,
      blankHeight: 0,
      x: 0,
      y: 0,
      problem: 'Missing front',
    }),
  ).toBeNull()
})
it.each([
  ['object', null],
  ['label', { label: '' }],
  ['single', { memberIds: ['a'], referenceId: 'a' }],
  ['duplicates', { memberIds: ['a', 'a'], referenceId: 'a' }],
  ['reference', { referenceId: 'gone' }],
  ['direction', { direction: 'bad' }],
  ['origin', { origin: 'bad' }],
  ['NaN', { offsetX: NaN }],
  ['too large', { offsetY: 100001 }],
  ['negative margin', { margin: -1 }],
  ['margin limit', { margin: 1001 }],
  ['negative gap', { gap: -1 }],
  ['gap limit', { gap: 101 }],
] as [string, unknown][])('rejects malformed %s settings', (_name, change) => {
  const d = change === null ? null : { ...grainFixture().draft, ...(change as object) }
  expect(() => grainMatchDraftError(d)).not.toThrow()
  expect(grainMatchDraftError(d)).not.toBeNull()
})

it('rejects mismatched stock thickness and checks malformed worker bindings without throwing', () => {
  const f = grainFixture()
  f.fronts.forEach((t) => (t.part.thickness = 19))
  expect(() => grainMatchLayout(f.scene, group(f))).toThrow('stock thickness')
  const parts = nestBoards(accepted())
  parts[1].grainMatch!.sequence = NaN
  expect(() => matchedGroupProblem(parts, 14, { length: 2440, width: 1220 }, true)).not.toThrow()
  expect(matchedGroupProblem(parts, 14, { length: 2440, width: 1220 }, true)).toContain('sequence')
})

it('preserves horizontal matching and deterministic sequence when worker inputs are reordered', () => {
  const f = grainFixture()
  f.draft.direction = 'horizontal'
  const s = accepted(f),
    parts = nestBoards(s),
    job = { parts, clearance: 14, sheet: { length: 2440, width: 1220 }, hasGrain: true }
  const result = nestJob(job)
  expect(
    result.sheets[0].map((p) => [p.x, p.y, p.w, p.h, p.rotation, p.grainMatch!.sequence]),
  ).toEqual([
    [17, 17, 298, 718, 270, 1],
    [331, 17, 298, 718, 270, 2],
  ])
  expect(nestJob({ ...job, parts: [...parts].reverse() })).toEqual(result)
})
it('states count, target and structural errors before geometry and blocks invalid saved groups from nesting', () => {
  const f = grainFixture()
  expect(previewGrainMatch(f.scene, f.project, f.draft, 'gone').errors.join(' ')).toContain(
    'saved grain group',
  )
  f.scene.grainMatches = Array.from({ length: 50 }, (_, i) => ({
    version: 1,
    id: `g${i}`,
    draft: { ...f.draft, memberIds: [`a${i}`, `b${i}`], referenceId: `a${i}` },
  }))
  expect(previewGrainMatch(f.scene, f.project, f.draft).errors.join(' ')).toContain('50 grain')
  const s = accepted()
  s.grainMatches![0].draft.gap = -1
  const bad = regenerateGrainMatches(s)
  expect(boards(bad).every((p) => p.grainMatch!.problem?.includes('gap'))).toBe(true)
  expect(
    nestJob({
      parts: nestBoards(bad),
      clearance: 14,
      sheet: { length: 2440, width: 1220 },
      hasGrain: true,
    }).sheets,
  ).toEqual([])
})
it('escapes group names in CSV and sheet markup while retaining sequence labels', () => {
  const f = grainFixture()
  f.draft.label = '<Kitchen "A", fronts>'
  const s = accepted(f),
    records = manufacturingParts(s.parts, s.materials, s.components),
    labels = manufacturingLabels(records),
    result = nestJob({
      parts: nestBoards(s),
      clearance: 14,
      sheet: { length: 2440, width: 1220 },
      hasGrain: true,
    })
  const svg = buildSheetSvg(
    { length: 2440, width: 1220 },
    result.sheets[0],
    (id) => labels.get(id)!.text,
    600,
    labels,
    result.blanks,
  )
  expect(svg).toContain('&lt;Kitchen &quot;A&quot;, fronts&gt;')
  expect(svg).not.toContain('<Kitchen')
  expect(buildGrainMatchCsv(records)).toContain('"<Kitchen ""A"", fronts>"')
})

it('rejects malformed saved group identities and binding protocols at file boundaries', () => {
  const f = grainFixture(),
    g = group(f),
    b = boards(accepted(f))[0].grainMatch!
  for (const change of [null, { ...g, version: 2 }, { ...g, id: '' }])
    expect(grainMatchesError([change])).toContain('identity')
  for (const change of [
    { version: 2 },
    { groupId: '' },
    { label: '' },
    { direction: 'bad' },
    { problem: '' },
    { patternX: NaN },
    { blankWidth: 1000001 },
    { width: 0 },
    { memberCount: 101 },
    { sequence: 3 },
  ])
    expect(grainMatchBindingError({ ...b, ...change })).not.toBeNull()
  for (const change of [
    { label: 'x'.repeat(201) },
    { referenceId: '' },
    { memberIds: ['', 'a'], referenceId: 'a' },
    { memberIds: Array.from({ length: 101 }, (_, i) => String(i)), referenceId: '0' },
  ])
    expect(grainMatchDraftError({ ...f.draft, ...change })).not.toBeNull()
  expect(grainMatchesError([{ ...g, draft: { ...f.draft, gap: -1 } }])).toContain('gap')
  const distinct = {
    ...g,
    draft: { ...f.draft, memberIds: ['other-a', 'other-b'], referenceId: 'other-a' },
  }
  expect(grainMatchesError([g, distinct])).toContain('unique')
  expect(matchedGroupProblem([], 14, { length: 2440, width: 1220 }, true)).toContain('complete')
})

it('rejects nonpositive front thickness and excessive source blank dimensions', () => {
  const f = grainFixture()
  f.fronts[0].part.thickness = 0
  expect(() => grainMatchLayout(f.scene, group(f))).toThrow('positive thickness')
  const huge = grainFixture()
  huge.fronts[1].part.position.x = 100001
  expect(() => grainMatchLayout(huge.scene, group(huge))).toThrow('bounded dimensions')
})
