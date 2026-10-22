import {
  defaultWorktopFeature,
  worktopMachiningError,
  type WorktopFeature,
} from './worktopMachiningRecipe'
export interface ServiceFeature extends WorktopFeature {
  face: '+Z' | '-Z'
  count: number
  pitch: number
  axis: 'x' | 'y'
  web: number
  bayId?: string
}
export interface ServiceMachining {
  version: 1
  features: ServiceFeature[]
}
export function serviceMachiningError(value: unknown): string | null {
  const base = worktopMachiningError(value)
  if (base) return base.replaceAll('Worktop', 'Service')
  const recipe = value as ServiceMachining
  let total = 0
  for (const f of recipe.features) {
    if (!['+Z', '-Z'].includes(f.face) || !['x', 'y'].includes(f.axis))
      return 'Choose a broad panel face and repeat axis.'
    if (!Number.isSafeInteger(f.count) || f.count < 1 || f.count > 32 || (total += f.count) > 100)
      return 'Use 1–32 repeats and at most 100 resolved service openings.'
    if (
      !Number.isFinite(f.pitch) ||
      f.pitch < 0 ||
      (f.count > 1 && f.pitch <= 0) ||
      !Number.isFinite(f.web) ||
      f.web < 0
    )
      return 'Repeat pitch and minimum web must be finite and non-negative; repeated slots need positive pitch.'
    if (f.bayId !== undefined && (typeof f.bayId !== 'string' || !f.bayId.trim()))
      return 'Choose a valid appliance bay reference.'
  }
  return null
}
export function defaultServiceFeature(
  id: string,
  shape: 'rectangle' | 'circle' = 'circle',
): ServiceFeature {
  return {
    ...defaultWorktopFeature(id, shape),
    label: shape === 'circle' ? 'Cable / pipe hole' : 'Service opening',
    length: 80,
    width: 20,
    diameter: 35,
    face: '+Z',
    count: 1,
    pitch: 30,
    axis: 'y',
    web: 5,
  }
}
