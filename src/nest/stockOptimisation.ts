import type { ManufacturingBoard } from '../scene/manufacturingPart'
import type { StockOption, StockPlan, StockStrategy } from '../scene/stockPlanRecipe'
import { stockPlanError } from '../scene/stockPlanRecipe'
import { allowedRotations, type Placement, type MatchBlankPlacement, type Rotation } from './nest'
import { matchedGroupProblem, matchedRectangle, type NestBoard } from './nestJob'
export interface StockRect {
  x: number
  y: number
  w: number
  h: number
}
interface Unit {
  id: string
  material: string
  thickness: number
  w: number
  h: number
  grain: 'length' | 'width' | 'free'
  members: ManufacturingBoard[]
  matched: boolean
}
export interface StockSheet {
  stock: StockOption
  placements: Placement[]
  blanks: MatchBlankPlacement[]
  free: StockRect[]
  utilisation: number
}
export interface StockRemnant extends StockRect {
  id: string
  sheet: number
  stockId: string
}
export interface StockResult {
  strategy: StockStrategy
  sheets: StockSheet[]
  unplaced: { id: string; reason: string }[]
  remnants: StockRemnant[]
  counts: {
    stockId: string
    name: string
    kind: StockOption['kind']
    count: number
    remaining: number | null
    cost: number | null
  }[]
  cost: number
  unknownPrices: number
  area: number
  waste: number
}
const compatible = (u: Unit, s: StockOption) =>
  u.material === s.material && Math.abs(u.thickness - s.thickness) < 0.00001
function rotations(u: Unit, s: StockOption): Rotation[] {
  const grain =
    s.grain === 'width' && u.grain !== 'free'
      ? u.grain === 'length'
        ? 'width'
        : 'length'
      : u.grain
  return allowedRotations(grain, s.grain !== 'none')
}
const asNest = (p: ManufacturingBoard): NestBoard => ({
  kind: 'board',
  id: p.id,
  grain: p.grain,
  ...p.nesting,
  grainMatch: p.grainMatch,
})
function unitsOf(records: ManufacturingBoard[], clearance: number) {
  const units: Unit[] = [],
    rejected: StockResult['unplaced'] = [],
    groups = new Map<string, ManufacturingBoard[]>()
  const reject = (ps: ManufacturingBoard[], reason: string) =>
    rejected.push(...ps.map((p) => ({ id: p.id, reason })))
  for (const p of records) {
    if (p.grainMatch) {
      const id = p.grainMatch.groupId
      groups.set(id, [...(groups.get(id) ?? []), p])
      continue
    }
    if (
      p.cut.problem ||
      ![p.nesting.length, p.nesting.width, p.nesting.thickness].every(
        (n) => Number.isFinite(n) && n > 0 && n <= 100000,
      )
    ) {
      reject([p], p.cut.problem ?? 'Invalid panel dimensions.')
      continue
    }
    units.push({
      id: p.id,
      material: p.material,
      thickness: p.nesting.thickness,
      w: p.nesting.length,
      h: p.nesting.width,
      grain: p.grain,
      members: [p],
      matched: false,
    })
  }
  for (const [id, ps] of groups) {
    const b = ps[0].grainMatch!,
      problem =
        ps.find((p) => p.cut.problem)?.cut.problem ??
        (ps.some((p) => p.material !== ps[0].material)
          ? 'Matched materials disagree.'
          : matchedGroupProblem(
              ps.map(asNest),
              clearance,
              { length: 1000000, width: 1000000 },
              false,
            ))
    if (problem) {
      reject(ps, problem)
      continue
    }
    units.push({
      id,
      material: ps[0].material,
      thickness: ps[0].nesting.thickness,
      w: Math.ceil(b.blankWidth),
      h: Math.ceil(b.blankHeight),
      grain: b.direction === 'horizontal' ? 'length' : 'width',
      members: [...ps].sort((a, b) => a.grainMatch!.sequence - b.grainMatch!.sequence),
      matched: true,
    })
  }
  units.sort((a, b) => b.w * b.h - a.w * a.h || a.id.localeCompare(b.id))
  return { units, rejected }
}
interface Fit {
  unit: Unit
  r: Rotation
  at: StockRect
}
function fill(stock: StockOption, units: Unit[], pad: number) {
  const free: StockRect[] = [
      {
        x: stock.trim,
        y: stock.trim,
        w: stock.length - 2 * stock.trim,
        h: stock.width - 2 * stock.trim,
      },
    ],
    fits: Fit[] = []
  for (const unit of units) {
    if (!compatible(unit, stock)) continue
    let done = false
    for (let i = 0; i < free.length && !done; i++)
      for (const r of rotations(unit, stock)) {
        const box = free[i],
          w = (r % 180 ? unit.h : unit.w) + 2 * pad,
          h = (r % 180 ? unit.w : unit.h) + 2 * pad
        if (w > box.w + 0.00001 || h > box.h + 0.00001) continue
        fits.push({
          unit,
          r,
          at: { x: box.x + pad, y: box.y + pad, w: w - 2 * pad, h: h - 2 * pad },
        })
        free.splice(i, 1)
        if (box.w - w > 0.00001) free.push({ x: box.x + w, y: box.y, w: box.w - w, h })
        if (box.h - h > 0.00001) free.push({ x: box.x, y: box.y + h, w: box.w, h: box.h - h })
        free.sort((a, b) => a.y - b.y || a.x - b.x)
        done = true
        break
      }
  }
  return { fits, free }
}
export function optimiseStock(
  records: ManufacturingBoard[],
  plan: StockPlan,
  strategy = plan.strategy,
): StockResult {
  const error = stockPlanError(plan)
  if (error) throw Error(error)
  if (records.length > 1000 || new Set(records.map((p) => p.id)).size !== records.length)
    throw Error('Use up to 1000 distinct panels per optimisation job.')
  const { units, rejected } = unitsOf(records, plan.clearance),
    stocks = plan.stocks
      .filter((s) => s.enabled && (plan.useOffcuts || s.kind !== 'offcut'))
      .sort((a, b) => a.id.localeCompare(b.id)),
    used = new Map<string, number>(),
    sheets: StockSheet[] = [],
    pad = Math.ceil(plan.clearance / 2)
  let remaining = units
  while (remaining.length) {
    const candidates = stocks
      .filter((s) => s.quantity === null || (used.get(s.id) ?? 0) < s.quantity)
      .map((stock) => ({ stock, ...fill(stock, remaining, pad) }))
      .filter((c) => c.fits.length)
    const covered = (c: (typeof candidates)[number]) =>
      c.fits.reduce((sum, f) => sum + f.unit.w * f.unit.h, 0)
    candidates.sort((a, b) => {
      if (strategy === 'offcut-first' && a.stock.kind !== b.stock.kind)
        return a.stock.kind === 'offcut' ? -1 : 1
      if (strategy === 'lower-cost') {
        const ap = a.stock.kind === 'offcut' ? 0 : a.stock.price,
          bp = b.stock.kind === 'offcut' ? 0 : b.stock.price
        if ((ap === null) !== (bp === null)) return ap === null ? 1 : -1
        if (ap !== null && bp !== null && ap / covered(a) !== bp / covered(b))
          return ap / covered(a) - bp / covered(b)
      }
      return (
        covered(b) - covered(a) ||
        a.stock.length * a.stock.width - b.stock.length * b.stock.width ||
        a.stock.id.localeCompare(b.stock.id)
      )
    })
    const best = candidates[0]
    if (!best) break
    const index = sheets.length,
      placements: Placement[] = [],
      blanks: MatchBlankPlacement[] = []
    for (const f of best.fits) {
      if (!f.unit.matched) {
        placements.push({ id: f.unit.members[0].id, sheet: index, rotation: f.r, ...f.at })
        continue
      }
      const g = f.unit.members[0].grainMatch!
      blanks.push({ groupId: g.groupId, label: g.label, sheet: index, rotation: f.r, ...f.at })
      for (const member of f.unit.members) {
        const b = member.grainMatch!,
          at = matchedRectangle(b.x, b.y, b.width, b.height, f.unit.w, f.unit.h, f.r)
        placements.push({
          id: member.id,
          sheet: index,
          rotation: ((270 + f.r) % 360) as Rotation,
          x: f.at.x + at.x,
          y: f.at.y + at.y,
          w: at.w,
          h: at.h,
          grainMatch: { groupId: b.groupId, label: b.label, sequence: b.sequence },
        })
      }
    }
    sheets.push({
      stock: best.stock,
      placements,
      blanks,
      free: best.free,
      utilisation:
        placements.reduce((sum, p) => sum + p.w * p.h, 0) / (best.stock.length * best.stock.width),
    })
    used.set(best.stock.id, (used.get(best.stock.id) ?? 0) + 1)
    const ids = new Set(best.fits.map((f) => f.unit))
    remaining = remaining.filter((u) => !ids.has(u))
  }
  for (const u of remaining) {
    const possible = stocks.some((s) => fill(s, [u], pad).fits.length > 0)
    rejected.push(
      ...u.members.map((p) => ({
        id: p.id,
        reason: possible
          ? 'Insufficient available stock quantity.'
          : 'No enabled stock fits this material, thickness, grain, trim and clearance.',
      })),
    )
  }
  const counts = [...used].map(([stockId, count]) => {
    const s = stocks.find((s) => s.id === stockId)!
    return {
      stockId,
      name: s.name,
      kind: s.kind,
      count,
      remaining: s.quantity === null ? null : s.quantity - count,
      cost: s.kind === 'offcut' ? 0 : s.price === null ? null : s.price * count,
    }
  })
  const area = sheets.reduce((sum, s) => sum + s.stock.length * s.stock.width, 0),
    material = sheets.reduce((sum, s) => sum + s.placements.reduce((a, p) => a + p.w * p.h, 0), 0)
  return {
    strategy,
    sheets,
    unplaced: rejected.sort((a, b) => a.id.localeCompare(b.id)),
    counts,
    cost: counts.reduce((sum, c) => sum + (c.cost ?? 0), 0),
    unknownPrices: counts.filter((c) => c.cost === null).reduce((sum, c) => sum + c.count, 0),
    area,
    waste: area - material,
    remnants: sheets.flatMap((s, sheet) =>
      s.free
        .filter((r) => r.w >= plan.minLength && r.h >= plan.minWidth)
        .map((r, i) => ({ ...r, id: `${sheet}:${i}`, sheet, stockId: s.stock.id })),
    ),
  }
}
