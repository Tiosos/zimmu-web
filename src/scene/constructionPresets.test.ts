import { expect, it } from 'vitest'
import { constructionDraft, constructionCandidate } from './constructionDraft'
import { CARCASE_PRESETS } from './carcasePresets'
import {
  appendConstructionPresets,
  captureConstructionPreset,
  CONSTRUCTION_GROUPS,
  constructionDifferences,
  constructionSettings,
  parseConstructionPresets,
  PRESET_FILE_LIMIT,
  serializeConstructionPresets,
  stageConstructionPreset,
} from './constructionPresets'
const draft = () => constructionDraft(CARCASE_PRESETS[0].params)
const preset = () => captureConstructionPreset(' Workshop ', ' Everyday base ', draft())
const doc = (presets: unknown[], extra = {}) =>
  JSON.stringify({ format: 'zimmu-construction-presets', version: 1, presets, ...extra })
it('captures canonical construction settings without destination size, openings or rule pins', () => {
  const d = {
    ...draft(),
    toeKickHeight: ' 0100.0 ',
    width: '999',
    section: { id: 'secret' },
    ruleOverrides: { frontReveal: 99 },
  }
  const p = captureConstructionPreset(' Standard ', ' description ', d)
  expect(p.name).toBe('Standard')
  expect(p.description).toBe('description')
  expect(p.settings.toeKickHeight).toBe('100')
  expect(p.settings).not.toHaveProperty('width')
  expect(p.settings).not.toHaveProperty('section')
  expect(p.settings).not.toHaveProperty('ruleOverrides')
  expect(Object.keys(p.settings)).toHaveLength(Object.values(CONSTRUCTION_GROUPS).flat().length)
})
it('round trips and strips unknown fields at both entry and setting boundaries', () => {
  const p = {
    ...preset(),
    surprise: true,
    settings: { ...preset().settings, width: '99', section: 'bad' },
  }
  const raw = serializeConstructionPresets([p])
  expect(raw).not.toContain('surprise')
  expect(raw).not.toContain('width')
  expect(parseConstructionPresets(raw)).toEqual([
    { ...preset(), id: p.id, createdAt: p.createdAt, updatedAt: p.updatedAt },
  ])
})
it.each([null, [], 1, 'text'])('rejects non-object documents %j', (value) => {
  expect(() => parseConstructionPresets(JSON.stringify(value))).toThrow('object')
})
it.each([
  { version: 2 },
  { format: 'other' },
  { presets: null },
  { presets: new Array(101).fill({}) },
])('rejects incompatible or oversized envelopes %j', (extra) => {
  expect(() => parseConstructionPresets(doc([], extra))).toThrow()
})
it('rejects oversized UTF-8 data and malformed JSON', () => {
  expect(() => parseConstructionPresets('😃'.repeat(PRESET_FILE_LIMIT / 4 + 1))).toThrow('256 KiB')
  expect(() => parseConstructionPresets('{')).toThrow()
})
it.each([
  ['id', ''],
  ['name', ' '],
  ['name', 'x'.repeat(81)],
  ['description', 'x'.repeat(501)],
  ['description', null],
  ['createdAt', -1],
  ['updatedAt', Infinity],
  ['createdAt', '1'],
])('rejects invalid preset %s %j', (key, value) => {
  expect(() => parseConstructionPresets(doc([{ ...preset(), [key]: value }]))).toThrow()
})
it('rejects duplicate entry IDs', () => {
  const p = preset()
  expect(() => parseConstructionPresets(doc([p, p]))).toThrow('unique')
})
it.each(['hasTop', 'frameEnabled', 'pairStile'])('requires real booleans for %s', (key) => {
  expect(() => constructionSettings({ ...draft(), [key]: 'false' })).toThrow('boolean')
})
it.each(['backMode', 'baseMode', 'frontMount', 'jointMethod'])('rejects unknown enum %s', (key) => {
  expect(() => constructionSettings({ ...draft(), [key]: 'unknown' })).toThrow('Unsupported')
})
it.each([
  'toeKickHeight',
  'toeKickSetback',
  'frontReveal',
  'stileWidth',
  'railWidth',
  'midStileWidth',
  'midRailWidth',
])('rejects non-finite or negative %s', (key) => {
  for (const value of ['', ' ', 'Infinity', 'NaN', '-1', 10, null])
    expect(() => constructionSettings({ ...draft(), [key]: value })).toThrow('finite')
})
it('permits zero reveal/toe settings and requires positive frame widths', () => {
  expect(
    constructionSettings({ ...draft(), frontReveal: '0', toeKickHeight: '0', toeKickSetback: '0' })
      .frontReveal,
  ).toBe('0')
  for (const key of ['stileWidth', 'railWidth', 'midStileWidth', 'midRailWidth'])
    expect(() => constructionSettings({ ...draft(), [key]: '0' })).toThrow('positive')
})
it.each(['carcaseMaterial', 'backMaterial', 'frontMaterial', 'frameMaterial'])(
  'requires a bounded material name for %s',
  (key) => {
    expect(() => constructionSettings({ ...draft(), [key]: '' })).toThrow('1–80')
  },
)
it('appends independent fresh IDs and resolves names case-insensitively without mutation', () => {
  const p = preset(),
    other = { ...p, name: 'WORKSHOP' }
  const result = appendConstructionPresets([p], [other, other])
  expect(result.map((v) => v.name)).toEqual(['Workshop', 'WORKSHOP (2)', 'WORKSHOP (3)'])
  expect(new Set(result.map((v) => v.id)).size).toBe(3)
  result[1].settings.backMode = 'none'
  expect(p.settings.backMode).toBe('captured')
  expect(other.name).toBe('WORKSHOP')
})
it('enforces capacity on append', () => {
  expect(() => appendConstructionPresets(Array(100).fill(preset()), [preset()])).toThrow('100')
})
it('stages only selected groups and preserves dimensions and destination frame layouts', () => {
  const p = preset()
  p.settings.jointMethod = 'dowel'
  p.settings.backMode = 'applied'
  p.settings.frontReveal = '4'
  const destination = { ...draft(), width: '777', depth: '600', height: '810' }
  const staged = stageConstructionPreset(destination, p, ['joinery'])
  expect(staged).toEqual({ ...destination, jointMethod: 'dowel' })
  expect(constructionDifferences(destination, staged)).toEqual([
    { key: 'jointMethod', before: 'butt-screw', after: 'dowel' },
  ])
  expect(stageConstructionPreset(destination, p, [])).toEqual(destination)
  const base = CARCASE_PRESETS[0].params
  const candidate = constructionCandidate(base, staged).params
  expect(candidate.section).toBe(base.section)
  expect(candidate.width).toBe(777)
})
it('stages every settings group without changing the original draft or preset', () => {
  const d = draft(),
    p = preset()
  p.settings.hasTop = !d.hasTop
  p.settings.toeKickHeight = '150'
  p.settings.frontMount = 'inset'
  p.settings.frameEnabled = true
  p.settings.frontMaterial = 'Other'
  p.settings.jointMethod = 'dowel'
  const before = structuredClone(d)
  const staged = stageConstructionPreset(
    d,
    p,
    Object.keys(CONSTRUCTION_GROUPS) as (keyof typeof CONSTRUCTION_GROUPS)[],
  )
  expect(staged).toMatchObject(p.settings)
  expect(d).toEqual(before)
  expect(constructionDifferences(d, staged)).toHaveLength(6)
  expect(constructionDifferences(d, d)).toEqual([])
})

it('enforces the parsed library limit even when all entries are otherwise valid', () => {
  const p = preset()
  const presets = Array.from({ length: 101 }, (_, i) => ({ ...p, id: `entry_${i}` }))
  expect(() => parseConstructionPresets(doc(presets))).toThrow('100')
})
