import { DEFAULT_FRAME } from './carcasePresets'
import { carcaseRoles } from './carcaseRoles'
import { openingGeometry, openingLayoutErrors } from './openingLayouts'
import { materialForRole, overridesOf, roleThicknessFor } from './resolveThickness'
import type { CarcaseParams, ComponentId, DrawerComponent, MaterialDef, Part } from './types'

export const CONSTRUCTION_NUMBERS = [
  'width',
  'height',
  'depth',
  'toeKickHeight',
  'toeKickSetback',
  'frontReveal',
] as const
export const FRAME_NUMBERS = ['stileWidth', 'railWidth', 'midStileWidth', 'midRailWidth'] as const
export type ConstructionNumber = (typeof CONSTRUCTION_NUMBERS)[number]
export type FrameNumber = (typeof FRAME_NUMBERS)[number]
type Settings = Pick<
  CarcaseParams,
  | 'carcaseMaterial'
  | 'backMaterial'
  | 'frontMaterial'
  | 'frameMaterial'
  | 'hasTop'
  | 'backMode'
  | 'baseMode'
  | 'frontMount'
  | 'jointMethod'
>
export type ConstructionDraft = Settings &
  Record<ConstructionNumber | FrameNumber, string> & { frameEnabled: boolean; pairStile: boolean }
export function constructionDraft(params: CarcaseParams): ConstructionDraft {
  const frame = params.frame ?? DEFAULT_FRAME
  return {
    carcaseMaterial: params.carcaseMaterial,
    backMaterial: params.backMaterial,
    frontMaterial: params.frontMaterial,
    frameMaterial: params.frameMaterial,
    hasTop: params.hasTop,
    backMode: params.backMode,
    baseMode: params.baseMode,
    frontMount: params.frontMount,
    jointMethod: params.jointMethod,
    width: String(params.width),
    height: String(params.height),
    depth: String(params.depth),
    toeKickHeight: String(params.toeKickHeight),
    toeKickSetback: String(params.toeKickSetback),
    frontReveal: String(params.frontReveal),
    frameEnabled: params.frame !== undefined,
    pairStile: frame.pairStile ?? false,
    stileWidth: String(frame.stileWidth),
    railWidth: String(frame.railWidth),
    midStileWidth: String(frame.midStileWidth),
    midRailWidth: String(frame.midRailWidth),
  }
}
export function constructionCandidate(
  base: CarcaseParams,
  draft: ConstructionDraft,
): { params: CarcaseParams; errors: string[] } {
  const errors: string[] = []
  const numeric = (key: ConstructionNumber | FrameNumber, positive: boolean) => {
    const value = draft[key].trim() ? Number(draft[key]) : NaN
    if (!Number.isFinite(value) || (positive ? value <= 0 : value < 0))
      errors.push(`${key} must be a finite ${positive ? 'positive' : 'non-negative'} number.`)
    return value
  }
  const params: CarcaseParams = {
    ...base,
    width: numeric('width', true),
    height: numeric('height', true),
    depth: numeric('depth', true),
    toeKickHeight: numeric('toeKickHeight', false),
    toeKickSetback: numeric('toeKickSetback', false),
    frontReveal: numeric('frontReveal', false),
    carcaseMaterial: draft.carcaseMaterial,
    backMaterial: draft.backMaterial,
    frontMaterial: draft.frontMaterial,
    frameMaterial: draft.frameMaterial,
    hasTop: draft.hasTop,
    backMode: draft.backMode,
    baseMode: draft.baseMode,
    frontMount: draft.frontMount,
    jointMethod: draft.jointMethod,
  }
  if (draft.frameEnabled)
    params.frame = {
      ...base.frame,
      stileWidth: numeric('stileWidth', true),
      railWidth: numeric('railWidth', true),
      midStileWidth: numeric('midStileWidth', true),
      midRailWidth: numeric('midRailWidth', true),
      pairStile: draft.pairStile,
    }
  else delete params.frame
  return { params, errors }
}
export interface ConstructionSummary {
  dimensions: string
  opening: string
  panels: number
  materials: Record<string, number>
}
export function constructionSummary(
  params: CarcaseParams,
  materials: Record<string, MaterialDef>,
  parts: Part[],
  componentId: ComponentId,
): ConstructionSummary | null {
  const geometry = openingGeometry(params, materials, parts, componentId)
  if (geometry.errors.length || !geometry.tree) return null
  const root = geometry.tree.rects.get(params.section.id)!
  const overrides = overridesOf(parts, componentId)
  const roles = carcaseRoles(
    params,
    roleThicknessFor(params, materials, overrides),
    () => undefined,
  )
  const counts = new Map<string, number>()
  for (const role of roles) {
    const name = materialForRole(params, overrides, role.role)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const display = (n: number) => Number(n.toFixed(2))
  return {
    dimensions: `${params.width} × ${params.height} × ${params.depth} mm`,
    opening: `${display(root.x1 - root.x0)} × ${display(root.z1 - root.z0)} mm`,
    panels: roles.length,
    materials: Object.fromEntries(counts),
  }
}
export function constructionErrors(
  base: CarcaseParams,
  draft: ConstructionDraft,
  materials: Record<string, MaterialDef>,
  parts: Part[],
  id: ComponentId,
  drawers: DrawerComponent[],
): string[] {
  const candidate = constructionCandidate(base, draft)
  if (candidate.errors.length) return candidate.errors
  return openingLayoutErrors(
    candidate.params,
    candidate.params.section.id,
    materials,
    parts,
    id,
    drawers,
  )
}
