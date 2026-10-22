import type { MaterialDef, Scene } from './types'
import type { ProjectStructure } from './projectStructure'
import { manufacturingParts, type ManufacturingBoard } from './manufacturingPart'
import { stockPlanError, type StockPlan, type StockStrategy } from './stockPlanRecipe'
import { optimiseStock, type StockResult } from '../nest/stockOptimisation'
export const STOCK_STRATEGIES: StockStrategy[] = ['fewer-sheets', 'lower-cost', 'offcut-first']
export function defaultStockPlan(
  materials: Record<string, MaterialDef>,
  clearance = 14,
): StockPlan {
  return {
    version: 1,
    cabinetIds: [],
    strategy: 'fewer-sheets',
    useOffcuts: true,
    clearance,
    minLength: 100,
    minWidth: 100,
    stocks: Object.entries(materials)
      .filter(([, m]) => m.sheet && m.thickness && m.use !== 'edge')
      .map(([material, m], i) => ({
        id: `stock-${i}`,
        name: `${material} standard`,
        kind: 'sheet',
        material,
        thickness: m.thickness!,
        length: m.sheet!.length,
        width: m.sheet!.width,
        grain: m.hasGrain === false ? 'none' : 'length',
        quantity: null,
        price: m.sheet!.costPerSheet ?? null,
        trim: 0,
        enabled: true,
        location: '',
      })),
  }
}
export function stockRecords(
  scene: Scene,
  materials: Record<string, MaterialDef>,
  plan: StockPlan,
): ManufacturingBoard[] {
  return manufacturingParts(scene.parts, materials, scene.components).filter(
    (p): p is ManufacturingBoard =>
      p.kind === 'board' &&
      (!plan.cabinetIds.length ||
        (!!p.provenance.cabinetId && plan.cabinetIds.includes(p.provenance.cabinetId))),
  )
}
export const stockSignature = (
  scene: Scene,
  project: ProjectStructure,
  materials: Record<string, MaterialDef>,
) => JSON.stringify([scene, project, materials])
export interface StockPreview {
  signature: string
  draft: StockPlan
  result: StockResult | null
  comparisons: StockResult[]
  baselineIssue?: string
  baseline: StockResult | null
  errors: string[]
}
export function previewStockPlan(
  scene: Scene,
  project: ProjectStructure,
  materials: Record<string, MaterialDef>,
  draft: StockPlan,
): StockPreview {
  const p: StockPreview = {
    signature: stockSignature(scene, project, materials),
    draft: structuredClone(draft),
    result: null,
    comparisons: [],
    baseline: null,
    errors: [],
  }
  try {
    const error = stockPlanError(draft)
    if (error) throw Error(error)
    if (
      draft.cabinetIds.some(
        (id) => !scene.components.some((c) => c.id === id && c.kind === 'carcase'),
      )
    )
      throw Error('A selected cabinet is missing. Reset the selection.')
    const records = stockRecords(scene, materials, draft)
    if (!records.length) throw Error('The selection contains no board panels.')
    p.comparisons = STOCK_STRATEGIES.map((strategy) => optimiseStock(records, draft, strategy))
    p.result = p.comparisons.find((r) => r.strategy === draft.strategy)!
    const baseline = {
      ...defaultStockPlan(materials, draft.clearance),
      cabinetIds: draft.cabinetIds,
      minLength: draft.minLength,
      minWidth: draft.minWidth,
    }
    try {
      p.baseline = optimiseStock(records, baseline)
    } catch (e) {
      p.baselineIssue = e instanceof Error ? e.message : String(e)
    }
  } catch (e) {
    p.errors.push(e instanceof Error ? e.message : String(e))
  }
  return p
}
export function acceptStockPlan(
  scene: Scene,
  project: ProjectStructure,
  materials: Record<string, MaterialDef>,
  preview: StockPreview,
  action: 'save' | 'consume',
  remnantIds: string[] = [],
  batchId = '',
): Scene | null {
  if (preview.signature !== stockSignature(scene, project, materials)) return null
  const checked = previewStockPlan(scene, project, materials, preview.draft)
  if (checked.errors.length || !checked.result) return null
  const plan = structuredClone(checked.draft)
  if (action === 'save')
    return JSON.stringify(scene.stockPlan) === JSON.stringify(plan)
      ? null
      : { ...scene, stockPlan: plan }
  if (action !== 'consume' || checked.result.unplaced.length || !checked.result.sheets.length)
    return null
  const selected = checked.result.remnants.filter((r) => remnantIds.includes(r.id))
  if (selected.length !== remnantIds.length || plan.stocks.length + selected.length > 100)
    return null
  if (selected.length && (!batchId.trim() || batchId.length > 150)) return null
  const used = new Map(checked.result.counts.map((c) => [c.stockId, c.count]))
  plan.stocks = plan.stocks.map((s) => ({
    ...s,
    quantity: s.quantity === null ? null : s.quantity - (used.get(s.id) ?? 0),
  }))
  for (const [i, r] of selected.entries()) {
    const source = checked.result.sheets[r.sheet].stock,
      id = `${batchId}-${i}`
    if (plan.stocks.some((s) => s.id === id)) return null
    plan.stocks.push({
      ...source,
      id,
      name: `${source.name.slice(0, 150)} remnant ${i + 1}`,
      kind: 'offcut',
      length: r.w,
      width: r.h,
      quantity: 1,
      price: 0,
      trim: 0,
      location: source.location,
    })
  }
  return { ...scene, stockPlan: plan }
}
