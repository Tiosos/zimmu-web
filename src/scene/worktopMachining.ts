import type { BoardPart, CutDef, Scene } from './types'
import { finishingSignature } from './finishingPanels'
import {
  worktopMachiningError,
  type WorktopFeature,
  type WorktopMachining,
} from './worktopMachiningRecipe'
export type { WorktopFeature, WorktopMachining } from './worktopMachiningRecipe'
const EPS = 1e-6
export const worktopFeatureCutId = (id: string) => `wm_${id}`
export const worktopCutOwned = (part: BoardPart, id: string) =>
  !!part.worktopMachining?.features.some((f) => worktopFeatureCutId(f.id) === id)
export function worktopMachiningEligible(part: BoardPart): boolean {
  return (
    !part.driven &&
    part.role === undefined &&
    !part.frontPull &&
    !part.runWorktop?.draft.profile &&
    (!part.finishing || part.finishing.draft.kind === 'worktop')
  )
}
export interface ResolvedWorktopFeature {
  feature: WorktopFeature
  x: number
  y: number
  length: number
  width: number
  depth: number
  errors: string[]
  cut: CutDef | null
}
export function resolveWorktopFeatures(
  part: BoardPart,
  recipe: WorktopMachining,
): ResolvedWorktopFeature[] {
  const shapeError = worktopMachiningError(recipe)
  if (shapeError) throw Error(shapeError)
  if (!worktopMachiningEligible(part)) throw Error('Choose a role-free manual worktop board.')
  if (![part.length, part.width, part.thickness].every((v) => Number.isFinite(v) && v > 0.1))
    throw Error('Worktop dimensions must be finite and exceed 0.1 mm.')
  const rows = recipe.features.map((feature): ResolvedWorktopFeature => {
    const f = feature
    const x =
      f.xRef === 'left' ? f.x : f.xRef === 'right' ? part.length - f.x : part.length / 2 + f.x
    const y = f.yRef === 'front' ? f.y : f.yRef === 'rear' ? part.width - f.y : part.width / 2 + f.y
    const length = f.shape === 'circle' ? f.diameter : f.length,
      width = f.shape === 'circle' ? f.diameter : f.width
    const depth = f.mode === 'through' ? part.thickness : f.depth
    const errors: string[] = []
    const extents = [x - length / 2, x + length / 2, y - width / 2, y + width / 2]
    if (![x, y, depth, ...extents].every(Number.isFinite))
      errors.push('Resolved geometry must be finite.')
    if (
      extents[0] < f.clearance - EPS ||
      extents[1] > part.length - f.clearance + EPS ||
      extents[2] < f.clearance - EPS ||
      extents[3] > part.width - f.clearance + EPS
    )
      errors.push('Feature violates the minimum edge clearance.')
    if (f.mode === 'blind' && depth >= part.thickness - EPS)
      errors.push('Blind depth must leave material below the feature.')
    const id = worktopFeatureCutId(f.id)
    const cut: CutDef =
      f.shape === 'rectangle'
        ? {
            kind: 'box',
            id,
            label: f.label.trim(),
            face: '+Z',
            position: { x: x - length / 2, y: y - width / 2, z: part.thickness - depth },
            size: { x: length, y: width, z: depth },
          }
        : {
            kind: 'hole-array',
            id,
            label: f.label.trim(),
            face: '+Z',
            axis: 'U',
            start: { x, y, z: part.thickness },
            pitch: 0,
            count: 1,
            diameter: f.diameter,
            depth,
          }
    return { feature: { ...f }, x, y, length, width, depth, errors, cut }
  })
  const overlap = (a: ResolvedWorktopFeature, b: ResolvedWorktopFeature) => {
    const dx = Math.abs(a.x - b.x),
      dy = Math.abs(a.y - b.y)
    if (a.feature.shape === 'rectangle' && b.feature.shape === 'rectangle')
      return dx < (a.length + b.length) / 2 - EPS && dy < (a.width + b.width) / 2 - EPS
    if (a.feature.shape === 'circle' && b.feature.shape === 'circle')
      return Math.hypot(dx, dy) < (a.length + b.length) / 2 - EPS
    const circle = a.feature.shape === 'circle' ? a : b,
      rect = a.feature.shape === 'rectangle' ? a : b
    return (
      Math.hypot(Math.max(0, dx - rect.length / 2), Math.max(0, dy - rect.width / 2)) <
      circle.length / 2 - EPS
    )
  }
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++)
      if (overlap(rows[i], rows[j])) {
        rows[i].errors.push(`Overlaps ${rows[j].feature.label}.`)
        rows[j].errors.push(`Overlaps ${rows[i].feature.label}.`)
      }
  const valid = rows.filter((r) => !r.errors.length)
  const volume = part.length * part.width * part.thickness
  const removed = valid.reduce(
    (sum, r) =>
      sum +
      (r.feature.shape === 'circle' ? Math.PI * (r.length / 2) ** 2 : r.length * r.width) * r.depth,
    0,
  )
  if (
    valid.length &&
    (!Number.isFinite(volume) ||
      !Number.isFinite(removed) ||
      removed >= volume * (1 - Number.EPSILON * 8))
  )
    for (const row of valid)
      row.errors.push('Machining must leave a finite positive volume of board material.')
  for (const row of rows) if (row.errors.length) row.cut = null
  return rows
}
function ownedIds(p: BoardPart): Set<string> {
  return new Set(p.worktopMachining?.features.map((f) => worktopFeatureCutId(f.id)) ?? [])
}
function collision(part: BoardPart, recipe: WorktopMachining): boolean {
  const old = ownedIds(part),
    next = new Set(recipe.features.map((f) => worktopFeatureCutId(f.id)))
  return part.cuts.some(
    (c) =>
      next.has(c.id) &&
      (!old.has(c.id) ||
        ('sourceJointId' in c && c.sourceJointId !== undefined) ||
        ('sourceComponentId' in c && c.sourceComponentId !== undefined)),
  )
}
function rebuilt(
  part: BoardPart,
  recipe: WorktopMachining,
  rows: ResolvedWorktopFeature[],
): BoardPart {
  const old = ownedIds(part)
  return {
    ...part,
    worktopMachining: recipe.features.length ? structuredClone(recipe) : undefined,
    cuts: [
      ...part.cuts.filter((c) => !old.has(c.id)),
      ...rows.flatMap((r) => (r.cut ? [r.cut] : [])),
    ],
  }
}
export function regenerateWorktopMachining(scene: Scene): Scene {
  return {
    ...scene,
    parts: scene.parts.map((part) => {
      if (part.kind !== 'board' || !part.worktopMachining) return part
      try {
        if (collision(part, part.worktopMachining)) return part
        return rebuilt(
          part,
          part.worktopMachining,
          resolveWorktopFeatures(part, part.worktopMachining),
        )
      } catch {
        return part
      }
    }),
  }
}
export interface WorktopMachiningPreview {
  signature: string
  targetId: string
  recipe: WorktopMachining
  part: BoardPart | null
  rows: ResolvedWorktopFeature[]
  errors: string[]
  changed: boolean
}
export function previewWorktopMachining(
  scene: Scene,
  targetId: string,
  recipe: WorktopMachining,
): WorktopMachiningPreview {
  const result: WorktopMachiningPreview = {
    signature: finishingSignature(scene),
    targetId,
    recipe: structuredClone(recipe),
    part: null,
    rows: [],
    errors: [],
    changed: false,
  }
  try {
    const part = scene.parts.find((p) => p.id === targetId)
    if (part?.kind !== 'board') throw Error('The selected worktop is no longer available.')
    const error = worktopMachiningError(recipe)
    if (error) throw Error(error)
    if (collision(part, recipe)) throw Error('A feature cut ID conflicts with unrelated machining.')
    result.rows = resolveWorktopFeatures(part, recipe)
    result.errors = result.rows.flatMap((r) => r.errors.map((e) => `${r.feature.label}: ${e}`))
    result.part = rebuilt(part, recipe, result.rows)
    result.changed =
      JSON.stringify(part.worktopMachining ?? { version: 1, features: [] }) !==
        JSON.stringify(result.part.worktopMachining ?? { version: 1, features: [] }) ||
      JSON.stringify(part.cuts) !== JSON.stringify(result.part.cuts)
  } catch (cause) {
    result.errors = [
      cause instanceof Error ? cause.message : 'Worktop machining could not be built.',
    ]
  }
  return result
}
export function acceptWorktopMachining(
  scene: Scene,
  preview: WorktopMachiningPreview,
): Scene | null {
  if (
    preview.signature !== finishingSignature(scene) ||
    preview.errors.length ||
    !preview.part ||
    !preview.changed
  )
    return null
  const checked = previewWorktopMachining(scene, preview.targetId, preview.recipe)
  if (checked.errors.length || !checked.part || !checked.changed) return null
  return {
    ...scene,
    parts: scene.parts.map((p) => (p.id === checked.targetId ? checked.part! : p)),
  }
}
