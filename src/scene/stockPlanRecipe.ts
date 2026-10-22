export type StockStrategy = 'fewer-sheets' | 'lower-cost' | 'offcut-first'
export interface StockOption {
  id: string
  name: string
  kind: 'sheet' | 'offcut'
  material: string
  thickness: number
  length: number
  width: number
  grain: 'length' | 'width' | 'none'
  quantity: number | null
  price: number | null
  trim: number
  enabled: boolean
  location: string
}
export interface StockPlan {
  version: 1
  stocks: StockOption[]
  cabinetIds: string[]
  strategy: StockStrategy
  useOffcuts: boolean
  clearance: number
  minLength: number
  minWidth: number
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 200
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
export function stockPlanError(value: unknown): string | null {
  if (!record(value) || value.version !== 1) return 'Invalid stock plan version.'
  if (!Array.isArray(value.stocks) || value.stocks.length > 100)
    return 'Use at most 100 stock options.'
  if (
    !Array.isArray(value.cabinetIds) ||
    value.cabinetIds.length > 200 ||
    value.cabinetIds.some((id) => !text(id)) ||
    new Set(value.cabinetIds).size !== value.cabinetIds.length
  )
    return 'Choose distinct cabinet identities (up to 200).'
  if (
    !['fewer-sheets', 'lower-cost', 'offcut-first'].includes(value.strategy as string) ||
    typeof value.useOffcuts !== 'boolean'
  )
    return 'Choose a supported stock strategy and offcut policy.'
  if (
    !finite(value.clearance, 0, 100) ||
    !finite(value.minLength, 1, 100000) ||
    !finite(value.minWidth, 1, 100000)
  )
    return 'Tool clearance must be 0–100 mm and remnant minimums 1–100000 mm.'
  const ids = new Set<string>()
  for (const s of value.stocks) {
    if (!record(s) || !text(s.id) || !text(s.name) || !text(s.material) || ids.has(s.id))
      return 'Stock identities, names and materials must be valid and identities unique.'
    ids.add(s.id as string)
    if (
      !['sheet', 'offcut'].includes(s.kind as string) ||
      !['length', 'width', 'none'].includes(s.grain as string) ||
      typeof s.enabled !== 'boolean' ||
      typeof s.location !== 'string' ||
      s.location.length > 200
    )
      return 'Invalid stock type, grain, availability or location.'
    if (
      !finite(s.length, 1, 100000) ||
      !finite(s.width, 1, 100000) ||
      !finite(s.thickness, 0.1, 1000) ||
      !finite(s.trim, 0, 1000) ||
      2 * s.trim >= Math.min(s.length, s.width)
    )
      return 'Stock needs positive bounded dimensions and trim smaller than half its shortest edge.'
    if (s.quantity !== null && (!Number.isInteger(s.quantity) || !finite(s.quantity, 0, 10000)))
      return 'Quantity must be a whole number from 0 to 10000, or unlimited.'
    if (s.kind === 'offcut' && s.quantity === null) return 'Offcuts require a finite quantity.'
    if (s.price !== null && !finite(s.price, 0, 1000000000))
      return 'Price must be nonnegative and finite, or unknown.'
  }
  return null
}
