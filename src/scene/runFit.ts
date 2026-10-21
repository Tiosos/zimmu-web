import type { CarcaseComponent, DrawerComponent, Scene, Vec3 } from './types'
import { constructionDraft, constructionErrors } from './constructionDraft'
import { frontsSignature } from './frontsDrawers'
import { worldBoundsOf } from './carcaseWorldBounds'
import { layoutDraft, previewLayout } from './layoutTools'
import { resolvePlacement } from './resolvePlacement'
import { applyPipeline } from './pipeline'

export interface RunFitEntry {
  id: string
  fixed: boolean
  min: string
  max: string
}
export interface RunFitDraft {
  entries: RunFitEntry[]
  target: string
  start: string
  end: string
  gap: string
  axis: 'x' | 'y'
  direction: 1 | -1
  allocation: 'equal' | 'proportional'
  detach: boolean
}
export interface RunFitRow {
  id: string
  label: string
  beforeWidth: number
  afterWidth: number
  before: Vec3
  after: Vec3
  fixed: boolean
}
export interface RunFitPreview {
  signature: string
  draft: RunFitDraft
  scene: Scene | null
  errors: string[]
  overlaps: ReturnType<typeof previewLayout>['overlaps']
  rows: RunFitRow[]
  changed: boolean
  cabinetSpan: number
  target: number
  reserve: number
  gaps: number
}
export function runFitDraft(ids: string[]): RunFitDraft {
  return {
    entries: ids.map((id) => ({ id, fixed: false, min: '100', max: '2400' })),
    target: '2400',
    start: '0',
    end: '0',
    gap: '0',
    axis: 'x',
    direction: 1,
    allocation: 'equal',
    detach: false,
  }
}
function number(value: string, label: string, positive = false): number {
  const n = value.trim() ? Number(value) : NaN
  if (!Number.isFinite(n) || (positive ? n <= 0 : n < 0))
    throw Error(`${label} must be a finite ${positive ? 'positive' : 'non-negative'} number.`)
  return n
}
export function allocateRunWidths(
  budget: number,
  limits: { min: number; max: number; weight: number }[],
): number[] {
  if (
    !limits.length ||
    !Number.isFinite(budget) ||
    budget <= 0 ||
    limits.some(
      (p) =>
        ![p.min, p.max, p.weight].every(Number.isFinite) ||
        p.min <= 0 ||
        p.max < p.min ||
        p.weight <= 0,
    )
  )
    throw Error('Width allocation requires positive finite bounds and weights.')
  const minimum = limits.reduce((n, p) => n + p.min, 0),
    maximum = limits.reduce((n, p) => n + p.max, 0)
  if (budget < minimum - 1e-6 || budget > maximum + 1e-6)
    throw Error(
      `Available width ${budget} mm cannot fit the minimum ${minimum} mm and maximum ${maximum} mm.`,
    )
  const weights = limits.map((p) => p.weight / Math.max(...limits.map((v) => v.weight)))
  let lo = 0,
    hi = Math.max(...limits.map((p, i) => p.max / weights[i]))
  if (!Number.isFinite(hi)) throw Error('Width allocation exceeds the supported numeric range.')
  const at = (lambda: number) =>
    limits.map((p, i) => Math.max(p.min, Math.min(p.max, lambda * weights[i])))
  for (let i = 0; i < 100; i++) {
    const middle = (lo + hi) / 2
    if (at(middle).reduce((a, b) => a + b, 0) < budget) lo = middle
    else hi = middle
  }
  const widths = at((lo + hi) / 2),
    error = budget - widths.reduce((a, b) => a + b, 0)
  const index = limits.findIndex((p, i) => widths[i] + error >= p.min && widths[i] + error <= p.max)
  if (index >= 0) widths[index] += error
  if (Math.abs(widths.reduce((a, b) => a + b, 0) - budget) > 1e-6)
    throw Error('Width allocation could not resolve the target precisely.')
  return widths
}
export function previewRunFit(scene: Scene, input: RunFitDraft): RunFitPreview {
  const draft = structuredClone(input)
  const result: RunFitPreview = {
    signature: frontsSignature(scene),
    draft,
    scene: null,
    errors: [],
    overlaps: [],
    rows: [],
    changed: false,
    cabinetSpan: 0,
    target: 0,
    reserve: 0,
    gaps: 0,
  }
  try {
    const ids = draft.entries.map((e) => e.id)
    if (ids.length < 2 || ids.length > 100 || new Set(ids).size !== ids.length)
      throw Error('Select 2–100 distinct cabinets to fit a run.')
    if (
      !['x', 'y'].includes(draft.axis) ||
      ![1, -1].includes(draft.direction) ||
      !['equal', 'proportional'].includes(draft.allocation)
    )
      throw Error('Choose a supported run axis, direction and allocation.')
    const resolved = resolvePlacement(scene)
    const cabinets = ids.map((id) => {
      const c = resolved.components.find((v) => v.id === id)
      if (c?.kind !== 'carcase') throw Error('A selected cabinet is no longer available.')
      return c
    })
    const first = cabinets[0]
    if (cabinets.some((c) => c.parentId !== first.parentId))
      throw Error('Selected cabinets must share one parent frame.')
    if (
      scene.components.some((c) => ids.includes(c.id) && c.kind === 'carcase' && c.anchor) &&
      !draft.detach
    )
      throw Error('Detach selected anchors before fitting this run.')
    const angle = (n: number) => ((n % 360) + 360) % 360
    const orientation = angle(first.rotation.z)
    if (
      cabinets.some(
        (c) =>
          ![
            c.rotation.x,
            c.rotation.y,
            c.rotation.z,
            c.position.x,
            c.position.y,
            c.position.z,
          ].every(Number.isFinite) ||
          Math.abs(c.rotation.x) > 1e-6 ||
          Math.abs(c.rotation.y) > 1e-6 ||
          Math.abs(angle(c.rotation.z) - orientation) > 1e-6,
      ) ||
      !(draft.axis === 'x' ? [0, 180] : [90, 270]).some((n) => Math.abs(n - orientation) < 1e-6)
    )
      throw Error(
        'Choose upright, co-oriented cabinets whose widths follow the run axis (X: 0°/180°, Y: 90°/270°).',
      )
    const target = number(draft.target, 'Target span', true),
      start = number(draft.start, 'Start reserve'),
      end = number(draft.end, 'End reserve'),
      gap = number(draft.gap, 'Cabinet gap')
    const limits = draft.entries.map((entry, i) => {
      const width = cabinets[i].params.width
      if (!Number.isFinite(width) || width <= 0)
        throw Error('Current cabinet widths must be positive and finite.')
      return entry.fixed
        ? { min: width, max: width, weight: width }
        : {
            min: number(entry.min, 'Minimum width', true),
            max: number(entry.max, 'Maximum width', true),
            weight: draft.allocation === 'equal' ? 1 : width,
          }
    })
    if (draft.entries.every((e) => e.fixed))
      throw Error('Unlock at least one cabinet width to fit a run.')
    const gaps = gap * (ids.length - 1),
      budget = target - start - end - gaps
    const widths = allocateRunWidths(budget, limits)
    const axis = draft.axis,
      cross = axis === 'x' ? 'y' : 'x'
    const interval = (c: CarcaseComponent, a: 'x' | 'y') => {
      const b = worldBoundsOf(c, scene.materials)
      return a === 'x' ? [b.x0, b.x1] : [b.y0, b.y1]
    }
    const origin = interval(first, axis)[draft.direction === 1 ? 0 : 1],
      near = interval(first, cross)[0]
    let cursor = origin + draft.direction * start
    const proposed = cabinets.map((c, i) => {
      const next: CarcaseComponent = {
        ...c,
        params: { ...c.params, width: widths[i] },
        position: { ...c.position },
        anchor: undefined,
      }
      const errors = constructionErrors(
        c.params,
        constructionDraft(next.params),
        scene.materials,
        scene.parts,
        c.id,
        scene.components.filter(
          (v): v is DrawerComponent => v.kind === 'drawer' && v.parentId === c.id,
        ),
      )
      if (errors.length) throw Error(`${c.label}: ${errors.join('; ')}`)
      next.position[axis] += cursor - interval(next, axis)[draft.direction === 1 ? 0 : 1]
      next.position[cross] += near - interval(next, cross)[0]
      if (!Object.values(next.position).every(Number.isFinite))
        throw Error('Fitted cabinet positions must be finite.')
      cursor += draft.direction * (widths[i] + gap)
      return next
    })
    const byId = new Map(proposed.map((c) => [c.id, c]))
    const after = applyPipeline({
      ...scene,
      components: resolved.components.map((c) => byId.get(c.id) ?? c),
    })
    for (const c of proposed) {
      const actual = after.components.find((v) => v.id === c.id)
      if (
        actual?.kind !== 'carcase' ||
        Math.abs(actual.params.width - c.params.width) > 1e-6 ||
        (['x', 'y', 'z'] as const).some((a) => Math.abs(actual.position[a] - c.position[a]) > 1e-6)
      )
        throw Error(
          'A cabinet rule changed the requested fit; review its construction before fitting.',
        )
    }
    const assessment = previewLayout(after, layoutDraft(after, ids))
    if (assessment.errors.length) throw Error(assessment.errors.join('; '))
    result.rows = proposed.map((c, i) => ({
      id: c.id,
      label: c.label,
      beforeWidth: cabinets[i].params.width,
      afterWidth: c.params.width,
      before: { ...cabinets[i].position },
      after: { ...c.position },
      fixed: draft.entries[i].fixed,
    }))
    result.changed =
      result.rows.some(
        (row) =>
          Math.abs(row.beforeWidth - row.afterWidth) > 1e-6 ||
          (['x', 'y', 'z'] as const).some((a) => Math.abs(row.before[a] - row.after[a]) > 1e-6),
      ) ||
      scene.components.some(
        (c) => ids.includes(c.id) && c.kind === 'carcase' && c.anchor !== undefined,
      )
    Object.assign(result, {
      scene: after,
      overlaps: assessment.overlaps,
      cabinetSpan: widths.reduce((a, b) => a + b, 0),
      target,
      reserve: start + end,
      gaps,
    })
  } catch (cause) {
    result.errors = [cause instanceof Error ? cause.message : 'Run fitting failed.']
  }
  return result
}
export function acceptRunFit(scene: Scene, preview: RunFitPreview): Scene | null {
  if (preview.errors.length || !preview.changed || preview.signature !== frontsSignature(scene))
    return null
  const checked = previewRunFit(scene, preview.draft)
  return checked.errors.length || !checked.changed ? null : checked.scene
}
