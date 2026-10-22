import { expect, it } from 'vitest'
import { optimiseStock } from './stockOptimisation'
import { stockFixture, stockOption } from './__fixtures__/stock'
import { stockPlanError } from '../scene/stockPlanRecipe'
import {
  previewStockPlan,
  acceptStockPlan,
  defaultStockPlan,
  stockRecords,
} from '../scene/stockPlanning'
import { grainFixture } from '../scene/__fixtures__/grainMatch'
import { acceptGrainMatch, previewGrainMatch } from '../scene/grainMatching'
import { manufacturingParts, type ManufacturingBoard } from '../scene/manufacturingPart'
import { buildStockCsv, buildStockSheetSvg } from '../ui/buildStockExports'
import { FILE_FORMAT_VERSION, parseFile } from '../scene/useFile'
import { validateCurrentFile, validateLegacyFileInput } from '../scene/fileValidation'
import type { ZimmuFile } from '../scene/types'
it('places real cut rectangles without overlap and keeps clearance inside trimmed stock', () => {
  const f = stockFixture(3)
  f.plan.clearance = 3
  f.plan.stocks = [stockOption({ trim: 5, width: 100 })]
  const before = JSON.stringify(f),
    r = optimiseStock(f.records, f.plan)
  expect(r.unplaced).toEqual([])
  expect(r.sheets).toHaveLength(2)
  const p = r.sheets[0].placements
  expect(p[0]).toMatchObject({ x: 7, y: 7, w: 100, h: 50, rotation: 0 })
  expect(p[1]).toMatchObject({ x: 111, y: 7 })
  for (const s of r.sheets)
    for (const p of s.placements) {
      expect(p.x).toBeGreaterThanOrEqual(7)
      expect(p.y).toBeGreaterThanOrEqual(7)
      expect(p.x + p.w).toBeLessThanOrEqual(213)
      expect(p.y + p.h).toBeLessThanOrEqual(93)
    }
  expect(JSON.stringify(f)).toBe(before)
  expect(r.counts[0].count).toBe(2)
  expect(r.cost).toBe(40)
})
it('supports both stock grain axes and ungrained rotation', () => {
  const f = stockFixture(1)
  f.plan.stocks = [stockOption({ length: 60, width: 110 })]
  expect(optimiseStock(f.records, f.plan).unplaced).toHaveLength(1)
  for (const grain of ['width', 'none'] as const) {
    f.plan.stocks[0].grain = grain
    expect(optimiseStock(f.records, f.plan).sheets[0].placements[0]).toMatchObject({
      rotation: 90,
      w: 50,
      h: 100,
    })
  }
  f.records[0].grain = 'free'
  f.plan.stocks[0].grain = 'length'
  expect(optimiseStock(f.records, f.plan).unplaced).toEqual([])
})
it('honours finite quantities and distinguishes depletion from incompatibility', () => {
  const f = stockFixture(3)
  f.plan.stocks = [stockOption({ length: 100, width: 50, quantity: 1 })]
  const r = optimiseStock(f.records, f.plan)
  expect(r.sheets).toHaveLength(1)
  expect(r.counts[0].remaining).toBe(0)
  expect(r.unplaced).toHaveLength(2)
  expect(r.unplaced[0].reason).toContain('quantity')
  for (const change of [
    { enabled: false },
    { material: 'Other' },
    { thickness: 19 },
    { trim: 1 },
    { length: 99 },
  ]) {
    f.plan.stocks = [stockOption({ length: 100, width: 50, ...change })]
    const rejected = optimiseStock(f.records, f.plan).unplaced
    expect(rejected).toHaveLength(3)
    expect(rejected[0].reason).toContain('No enabled stock')
  }
})
it('compares mixed sizes, immediate costs and offcut preference deterministically', () => {
  const f = stockFixture(4),
    small = stockOption({ id: 'small', length: 100, width: 50, price: 1 }),
    big = stockOption({ id: 'big', price: 20 }),
    off = stockOption({ id: 'off', kind: 'offcut', length: 100, width: 50, quantity: 1, price: 0 })
  f.plan.stocks = [small, big, off]
  const fewer = optimiseStock(f.records, f.plan, 'fewer-sheets')
  expect(fewer.sheets).toHaveLength(1)
  expect(fewer.counts[0].stockId).toBe('big')
  const cost = optimiseStock(f.records, f.plan, 'lower-cost')
  expect(cost.cost).toBe(3)
  expect(cost.counts.find((c) => c.stockId === 'off')!.count).toBe(1)
  const first = optimiseStock(f.records, f.plan, 'offcut-first')
  expect(first.sheets[0].stock.id).toBe('off')
  expect(
    optimiseStock(
      [...f.records].reverse(),
      { ...f.plan, stocks: [...f.plan.stocks].reverse() },
      'offcut-first',
    ),
  ).toEqual(first)
  f.plan.useOffcuts = false
  expect(
    optimiseStock(f.records, f.plan, 'offcut-first').counts.some((c) => c.kind === 'offcut'),
  ).toBe(false)
})
it('reports missing price coverage and never treats an unknown purchase price as zero', () => {
  const f = stockFixture(1)
  f.plan.stocks = [
    stockOption({ id: 'unknown', price: null }),
    stockOption({ id: 'known', price: 3 }),
  ]
  expect(optimiseStock(f.records, f.plan, 'lower-cost').counts[0].stockId).toBe('known')
  f.plan.stocks.splice(1)
  const r = optimiseStock(f.records, f.plan)
  expect(r.unknownPrices).toBe(1)
  expect(r.counts[0].cost).toBeNull()
})
it('returns disjoint reusable rectangles outside panels, trim and clearance', () => {
  const f = stockFixture(1)
  f.plan.clearance = 4
  f.plan.stocks = [stockOption({ trim: 5 })]
  const r = optimiseStock(f.records, f.plan)
  expect(r.remnants.map((p) => [p.x, p.y, p.w, p.h])).toEqual([
    [109, 5, 106, 54],
    [5, 59, 210, 56],
  ])
  expect(r.area).toBe(26400)
  expect(r.waste).toBe(21400)
  for (const a of r.remnants) {
    expect(a.x).toBeGreaterThanOrEqual(5)
    expect(a.y).toBeGreaterThanOrEqual(5)
    for (const b of r.sheets[0].placements)
      expect(a.x >= b.x + b.w || a.x + a.w <= b.x || a.y >= b.y + b.h || a.y + a.h <= b.y).toBe(
        true,
      )
  }
  f.plan.minLength = 200
  expect(optimiseStock(f.records, f.plan).remnants).toHaveLength(1)
  f.plan.minWidth = 100
  expect(optimiseStock(f.records, f.plan).remnants).toEqual([])
})
it('keeps front groups atomic across mixed stock and expands actual identities and rotations', () => {
  const f = grainFixture(),
    s = acceptGrainMatch(
      f.scene,
      f.project,
      previewGrainMatch(f.scene, f.project, f.draft),
      'group',
    )!,
    records = (
      manufacturingParts(s.parts, s.materials, s.components) as ManufacturingBoard[]
    ).filter((p) => p.grainMatch),
    plan = defaultStockPlan(s.materials, 14)
  plan.stocks = plan.stocks.filter((p) => p.material === f.material)
  const r = optimiseStock(records, plan)
  expect(r.unplaced).toEqual([])
  expect(r.sheets[0].blanks).toHaveLength(1)
  expect(r.sheets[0].placements.map((p) => [p.rotation, p.w, p.h])).toEqual([
    [0, 718, 298],
    [0, 718, 298],
  ])
  plan.stocks[0].length = 720
  plan.stocks[0].width = 320
  expect(optimiseStock(records, plan).sheets).toEqual([])
  expect(optimiseStock(records.slice(0, 1), plan).unplaced[0].reason).toContain('complete')
  const broken = structuredClone(records)
  broken[0].material = 'Other'
  expect(optimiseStock(broken, plan).unplaced[0].reason).toContain('materials')
})
it('rejects invalid cut dimensions, duplicate identities and oversized jobs before packing', () => {
  const f = stockFixture(1)
  f.records[0].nesting.length = NaN
  expect(optimiseStock(f.records, f.plan).unplaced[0].reason).toContain('Invalid panel')
  expect(() => optimiseStock([f.records[0], f.records[0]], f.plan)).toThrow('distinct')
  expect(() =>
    optimiseStock(
      Array.from({ length: 1001 }, (_, i) => ({ ...f.records[0], id: String(i) })),
      f.plan,
    ),
  ).toThrow('1000')
  expect(() => optimiseStock(f.records, { ...f.plan, clearance: NaN })).toThrow('clearance')
})
it('recomputes acceptance, consumes only finite stock and creates selected remnants atomically', () => {
  const f = stockFixture(1)
  f.plan.stocks = [stockOption({ quantity: 2 })]
  const p = previewStockPlan(f.scene, f.project, f.scene.materials, f.plan)
  expect(p.errors).toEqual([])
  expect(p.comparisons).toHaveLength(3)
  expect(p.baseline!.sheets).toHaveLength(1)
  p.result!.counts[0].count = 999
  const next = acceptStockPlan(
    f.scene,
    f.project,
    f.scene.materials,
    p,
    'consume',
    [p.result!.remnants[0].id],
    'batch',
  )!
  expect(next.stockPlan!.stocks[0].quantity).toBe(1)
  expect(next.stockPlan!.stocks[1]).toMatchObject({
    id: 'batch-0',
    kind: 'offcut',
    quantity: 1,
    length: 120,
    width: 50,
    trim: 0,
    location: 'Rack A',
  })
  expect(next.parts).toBe(f.scene.parts)
  expect(f.scene.stockPlan).toBeUndefined()
  expect(acceptStockPlan(next, f.project, f.scene.materials, p, 'consume', [], 'again')).toBeNull()
  const saved = acceptStockPlan(f.scene, f.project, f.scene.materials, p, 'save')!
  expect(saved.stockPlan).toEqual(f.plan)
  expect(
    acceptStockPlan(
      saved,
      f.project,
      f.scene.materials,
      previewStockPlan(saved, f.project, f.scene.materials, f.plan),
      'save',
    ),
  ).toBeNull()
})
it('rejects stale, incomplete, forged or colliding inventory commands', () => {
  const f = stockFixture(2)
  f.plan.stocks = [stockOption({ length: 100, width: 50, quantity: 1 })]
  let p = previewStockPlan(f.scene, f.project, f.scene.materials, f.plan)
  expect(
    acceptStockPlan(f.scene, f.project, f.scene.materials, p, 'consume', [], 'batch'),
  ).toBeNull()
  expect(
    acceptStockPlan(
      f.scene,
      f.project,
      { ...f.scene.materials, Changed: { thickness: 18 } },
      p,
      'save',
    ),
  ).toBeNull()
  const project = structuredClone(f.project)
  project.areas[0].name = 'Changed'
  expect(acceptStockPlan(f.scene, project, f.scene.materials, p, 'save')).toBeNull()
  f.plan.stocks = [stockOption()]
  p = previewStockPlan(f.scene, f.project, f.scene.materials, f.plan)
  const id = p.result!.remnants[0].id
  for (const [ids, batch] of [
    [['gone'], 'b'],
    [[id, id], 'b'],
    [[id], ''],
    [[id], 's'],
  ] as [string[], string][]) {
    if (batch === 's') f.plan.stocks.push(stockOption({ id: 's-0' }))
    const fresh = previewStockPlan(f.scene, f.project, f.scene.materials, f.plan)
    expect(
      acceptStockPlan(f.scene, f.project, f.scene.materials, fresh, 'consume', ids, batch),
    ).toBeNull()
  }
  const bad = structuredClone(p)
  bad.draft.clearance = NaN
  expect(acceptStockPlan(f.scene, f.project, f.scene.materials, bad, 'save')).toBeNull()
  expect(
    previewStockPlan(f.scene, f.project, f.scene.materials, {
      ...f.plan,
      cabinetIds: ['gone'],
    }).errors.join(),
  ).toContain('missing')
  expect(
    previewStockPlan({ ...f.scene, parts: [] }, f.project, f.scene.materials, f.plan).errors.join(),
  ).toContain('no board')
})
it('exports quoted allocation, purchase and remnant details with safe SVG labels and usable boundaries', () => {
  const f = stockFixture(1)
  f.plan.stocks = [stockOption({ name: '<A "B">', trim: 5 })]
  const r = optimiseStock(f.records, f.plan),
    csv = buildStockCsv(r, () => '<part,"one">'),
    svg = buildStockSheetSvg(r, 0, () => '<part>')
  expect(csv).toContain('"<A ""B"">"')
  expect(csv).toContain('"Purchase"')
  expect(csv).toContain('"Remnant"')
  expect(svg).toContain('data-usable-stock')
  expect(svg).toContain('data-remnant')
  expect(svg).not.toContain('<part>')
  expect(svg).toContain('&lt;part&gt;')
})
it('roundtrips format 42, rejects malformed inventory on both boundaries and loads older projects', () => {
  const f = stockFixture(1),
    raw = {
      version: FILE_FORMAT_VERSION,
      name: 'Stock',
      appVersion: '0',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      scene: { ...f.scene, stockPlan: f.plan },
      project: f.project,
      camera: { position: { x: 0, y: 0, z: 1000 }, target: { x: 0, y: 0, z: 0 } },
    } as ZimmuFile
  expect(FILE_FORMAT_VERSION).toBe(42)
  expect(parseFile(JSON.stringify(raw)).scene.stockPlan).toEqual(f.plan)
  for (const validate of [validateCurrentFile, validateLegacyFileInput]) {
    const bad = structuredClone(raw)
    bad.scene.stockPlan!.stocks[0].quantity = -1
    expect(() => validate(bad)).toThrow('stockPlan')
  }
  const old = structuredClone(raw)
  old.version = 40
  delete old.scene.stockPlan
  expect(parseFile(JSON.stringify(old)).scene.stockPlan).toBeUndefined()
  expect(stockRecords(f.scene, f.scene.materials, f.plan)).toHaveLength(1)
})
it.each([
  ['version', { version: 2 }],
  ['stocks', { stocks: null }],
  ['stock cap', { stocks: Array.from({ length: 101 }, (_, i) => stockOption({ id: `s${i}` })) }],
  ['cabinets', { cabinetIds: ['a', 'a'] }],
  ['strategy', { strategy: 'bad' }],
  ['policy', { useOffcuts: 0 }],
  ['clearance', { clearance: -1 }],
  ['minimum', { minLength: 0 }],
  ...[
    { id: '' },
    { name: '' },
    { material: '' },
    { kind: 'bad' },
    { grain: 'bad' },
    { enabled: 'yes' },
    { location: 'x'.repeat(201) },
    { length: 0 },
    { length: 100001 },
    { width: Infinity },
    { thickness: 0 },
    { trim: 60 },
    { quantity: 0.5 },
    { quantity: 10001 },
    { kind: 'offcut', quantity: null },
    { price: -1 },
  ].map((change, i) => [`stock ${i}`, { stocks: [{ ...stockOption(), ...change }] }]),
  ['duplicate stock', { stocks: [stockOption(), stockOption()] }],
] as [string, object][])('rejects malformed %s settings', (_name, change) => {
  expect(stockPlanError({ ...stockFixture(0).plan, ...change })).not.toBeNull()
})

it('keeps valid custom stock usable when the library baseline has incomplete sheet dimensions', () => {
  const f = stockFixture(1)
  f.scene.materials.Panel.sheet!.width = 0
  const p = previewStockPlan(f.scene, f.project, f.scene.materials, f.plan)
  expect(p.errors).toEqual([])
  expect(p.result!.unplaced).toEqual([])
  expect(p.baseline).toBeNull()
  expect(p.baselineIssue).toContain('dimensions')
})
it('preserves unlimited purchases, handles exhausted inventory and limits remnant additions', () => {
  const f = stockFixture(1),
    p = previewStockPlan(f.scene, f.project, f.scene.materials, f.plan)
  expect(
    acceptStockPlan(f.scene, f.project, f.scene.materials, p, 'consume', [], 'batch')!.stockPlan!
      .stocks[0].quantity,
  ).toBeNull()
  const empty = { ...f.plan, stocks: [] },
    none = previewStockPlan(f.scene, f.project, f.scene.materials, empty)
  expect(acceptStockPlan(f.scene, f.project, f.scene.materials, none, 'consume')).toBeNull()
  const full = {
      ...f.plan,
      stocks: Array.from({ length: 100 }, (_, i) => stockOption({ id: `s${i}` })),
    },
    fullPreview = previewStockPlan(f.scene, f.project, f.scene.materials, full)
  expect(
    acceptStockPlan(
      f.scene,
      f.project,
      f.scene.materials,
      fullPreview,
      'consume',
      [fullPreview.result!.remnants[0].id],
      'batch',
    ),
  ).toBeNull()
})
