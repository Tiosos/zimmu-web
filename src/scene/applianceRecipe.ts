export const APPLIANCE_CATEGORIES = [
  'Oven',
  'Microwave',
  'Dishwasher',
  'Refrigerator',
  'Other',
] as const
export interface ApplianceBay {
  id: string
  cabinetId: string
  openingId: string
  label: string
  category: (typeof APPLIANCE_CATEGORIES)[number]
  width: number
  height: number
  depth: number
  left: number
  right: number
  top: number
  bottom: number
  rear: number
  alignment: 'left' | 'centre' | 'right'
  offset: number
  elevation: number
  recess: number
}
export const BAY_NUMBERS = [
  'width',
  'height',
  'depth',
  'left',
  'right',
  'top',
  'bottom',
  'rear',
  'offset',
  'elevation',
  'recess',
] as const
export function applianceBayError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Appliance bay must be an object.'
  const b = value as Record<string, unknown>
  for (const key of ['id', 'cabinetId', 'openingId', 'label'])
    if (typeof b[key] !== 'string' || !b[key].trim())
      return 'Name the bay and its cabinet/opening references.'
  if (!APPLIANCE_CATEGORIES.includes(b.category as ApplianceBay['category']))
    return 'Choose an appliance category.'
  if (!['left', 'centre', 'right'].includes(b.alignment as string))
    return 'Choose a horizontal reference.'
  for (const key of BAY_NUMBERS) {
    const n = b[key]
    if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 100000)
      return 'Bay dimensions must be finite and at most 100,000 mm in magnitude.'
    if (
      ['width', 'height', 'depth'].includes(key)
        ? n <= 0
        : !['offset', 'recess'].includes(key) && n < 0
    )
      return 'Body sizes must be positive; clearances and elevation must be non-negative.'
  }
  return null
}
export function applianceBaysError(value: unknown): string | null {
  if (value === undefined) return null
  if (!Array.isArray(value) || value.length > 500) return 'Use at most 500 appliance bays.'
  const ids = new Set<string>()
  for (const b of value) {
    const error = applianceBayError(b)
    if (error) return error
    if (ids.has(b.id)) return 'Appliance bay IDs must be unique.'
    ids.add(b.id)
  }
  return null
}
export function defaultApplianceBay(
  id: string,
  cabinetId: string,
  openingId: string,
): ApplianceBay {
  return {
    id,
    cabinetId,
    openingId,
    label: 'Appliance bay',
    category: 'Other',
    width: 300,
    height: 200,
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
  }
}
