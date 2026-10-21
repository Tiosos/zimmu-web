import type { BoardPart, CarcaseComponent, DrawerComponent, Scene } from './types'
import type { InteriorSpec } from './sectionTree'
import { componentsById } from './componentTree'
import { defaultInterior, sectionOpenings, setInterior } from './sectionInterior'
import { openingGeometry, openingLayoutErrors } from './openingLayouts'
import { nearestCarcase } from './nearestCarcase'
import { frontsSignature } from './frontsDrawers'
import { applyPipeline } from './pipeline'
import { buildShelfReadiness } from './shelfReadiness'
import { carcaseHardware } from './carcaseHardware'
import { productionLimitIssue } from './readinessLimits'
export interface ShelfForm {
  fixed: string
  shelves: string
  count: string
  rows: string
  front: string
  back: string
}
export type InteriorsDraft = Record<string, InteriorSpec>
export interface InteriorTarget {
  id: string
  number: number
  spec: InteriorSpec
  locked: boolean
}
export interface InteriorsPreview {
  signature: string
  cabinetId: string
  draft: InteriorsDraft
  scene: Scene | null
  errors: string[]
  changed: boolean
  boards: { role: string; label: string; size: string }[]
  beforeBoards: number
  pinBores: number
  diagnostics: string[]
  hardware: { key: string; before: number; after: number }[]
}
function cabinetOf(scene: Scene, id: string): CarcaseComponent {
  const c = scene.components.find((c) => c.id === id)
  if (c?.kind !== 'carcase') throw Error('The cabinet is no longer available.')
  return c
}
export function emptyShelfSpec(): InteriorSpec {
  const spec = defaultInterior(0)
  spec.adjustable.count = 0
  return spec
}
export function shelfForm(spec: InteriorSpec = defaultInterior(1)): ShelfForm {
  return {
    fixed: String(spec.fixedShelves),
    shelves: String(spec.adjustable.shelves),
    count: String(spec.adjustable.count),
    rows: String(spec.adjustable.rows),
    front: String(spec.adjustable.setback),
    back: String(spec.adjustable.backSetback),
  }
}
export function parseShelfForm(form: ShelfForm): InteriorSpec {
  const n = (key: keyof ShelfForm, max?: number) => {
    const value = form[key].trim() ? Number(form[key]) : NaN
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (max !== undefined && (!Number.isSafeInteger(value) || value > max))
    )
      throw Error(
        `${key} must be a finite non-negative ${max === undefined ? 'number' : `whole number at most ${max}`}.`,
      )
    return value
  }
  const fixedShelves = n('fixed', 32),
    shelves = n('shelves', 32),
    count = n('count', 1000),
    rows = n('rows', 2)
  if (rows !== 1 && rows !== 2) throw Error('Choose one or two pin rows.')
  return {
    fixedShelves,
    adjustable: { shelves, count, rows, pitch: 32, setback: n('front'), backSetback: n('back') },
  }
}
function validateSpec(spec: InteriorSpec): InteriorSpec {
  if (spec.adjustable.pitch !== 32) throw Error('Only 32 mm pin pitch is supported.')
  return parseShelfForm(shelfForm(spec))
}
export function interiorTargets(scene: Scene, id: string): InteriorTarget[] {
  const cabinet = cabinetOf(scene, id)
  const limit = productionLimitIssue(cabinet)
  if (limit) throw Error(limit)
  const geometry = openingGeometry(cabinet.params, scene.materials, scene.parts, id)
  const byId = componentsById(scene.components)
  if (geometry.errors.length || !geometry.tree)
    throw Error(geometry.errors.join('; ') || 'Cabinet openings cannot be resolved.')
  return sectionOpenings(cabinet.params.section, geometry.tree).map((opening, i) => ({
    id: opening.sectionId,
    number: i + 1,
    spec: structuredClone(opening.spec ?? emptyShelfSpec()),
    locked: scene.parts.some(
      (p) =>
        p.kind === 'board' &&
        !p.driven &&
        nearestCarcase(p, byId)?.id === id &&
        (p.role?.startsWith(`fixed-shelf-${opening.sectionId}-`) ||
          p.role?.startsWith(`adj-shelf-${opening.sectionId}-`)),
    ),
  }))
}
export function stageInteriors(
  scene: Scene,
  id: string,
  draft: InteriorsDraft,
  ids: string[],
  spec: InteriorSpec,
): InteriorsDraft {
  const targets = interiorTargets(scene, id),
    clean = validateSpec(spec)
  if (!ids.length || new Set(ids).size !== ids.length)
    throw Error('Select distinct editable openings.')
  for (const selected of ids) {
    const target = targets.find((t) => t.id === selected)
    if (!target || target.locked)
      throw Error('A selected opening is unavailable or has detached shelf boards.')
  }
  return {
    ...structuredClone(draft),
    ...Object.fromEntries(ids.map((id) => [id, structuredClone(clean)])),
  }
}
export function previewInteriors(
  scene: Scene,
  id: string,
  input: InteriorsDraft,
): InteriorsPreview {
  const result: InteriorsPreview = {
    signature: frontsSignature(scene),
    cabinetId: id,
    draft: structuredClone(input),
    scene: null,
    errors: [],
    changed: false,
    boards: [],
    beforeBoards: 0,
    pinBores: 0,
    diagnostics: [],
    hardware: [],
  }
  try {
    const cabinet = cabinetOf(scene, id),
      targets = interiorTargets(scene, id),
      entries = Object.entries(input)
    if (entries.length > 100) throw Error('Stage at most 100 openings at a time.')
    let section = cabinet.params.section
    const changed: string[] = []
    for (const [key, value] of entries) {
      const target = targets.find((t) => t.id === key)
      if (!target || target.locked)
        throw Error('A staged opening is unavailable or has detached shelf boards.')
      const clean = validateSpec(value)
      if (
        JSON.stringify([shelfForm(clean), clean.adjustable.pitch]) !==
        JSON.stringify([shelfForm(target.spec), target.spec.adjustable.pitch])
      ) {
        section = setInterior(section, key, clean)
        changed.push(key)
      }
    }
    if (!changed.length) {
      result.scene = scene
      return result
    }
    const params = { ...cabinet.params, section },
      drawers = scene.components.filter(
        (c): c is DrawerComponent => c.kind === 'drawer' && c.parentId === id,
      )
    const requested = (node: typeof section): number =>
      node.content.kind === 'split'
        ? node.content.children.reduce((n, c) => n + requested(c), 0)
        : (node.interior?.adjustable.shelves ?? 0) + (node.interior?.fixedShelves ?? 0)
    if (requested(section) > 1000)
      throw Error('Cabinet shelf requests exceed the supported assessment limit.')
    const limit = productionLimitIssue({ ...cabinet, params })
    if (limit) throw Error(limit)
    const errors = openingLayoutErrors(
      params,
      section.id,
      scene.materials,
      scene.parts,
      id,
      drawers,
    )
    if (errors.length) throw Error(errors.join('; '))
    const next = applyPipeline({
      ...scene,
      components: scene.components.map((c) => (c.id === id ? { ...cabinet, params } : c)),
    })
    const parts = next.parts.filter((p): p is BoardPart => p.kind === 'board' && p.parentId === id)
    const readiness = buildShelfReadiness({
      ...next,
      components: next.components.filter((c) => c.kind !== 'carcase' || c.id === id),
    })[0]
    if (readiness.requested === null || readiness.requested > 1000)
      throw Error('Cabinet shelf requests exceed the supported assessment limit.')
    for (const key of changed) {
      const spec = input[key],
        prefixes = [`fixed-shelf-${key}-`, `adj-shelf-${key}-`]
      const fixed = parts.filter((p) => p.role?.startsWith(prefixes[0])),
        adjustable = parts.filter((p) => p.role?.startsWith(prefixes[1]))
      const access = readiness.shelves.filter((s) => s.role.startsWith(prefixes[1]))
      result.diagnostics.push(
        ...access.map((s) => `${s.label}: ${s.status}${s.generated ? '' : ' (not generated)'}`),
      )
      if (fixed.length !== spec.fixedShelves || adjustable.length !== spec.adjustable.shelves)
        throw Error(
          `Opening ${targets.find((t) => t.id === key)!.number}: requested shelf boards were not generated. Check pin positions, drawer clearance and face-frame insertion.`,
        )
      const drilling = parts.flatMap((p) =>
        p.cuts
          .filter((c) => c.kind === 'hole-array' && c.id.startsWith(`holes_${p.role}_${key}_`))
          .map((c) => ({ part: p, cut: c })),
      )
      if (spec.adjustable.count > 0 && drilling.length !== spec.adjustable.rows * 2)
        throw Error(
          `Opening ${targets.find((t) => t.id === key)!.number}: requested pin rows were not generated on both sides.`,
        )
      for (const { part, cut } of drilling) {
        if (cut.kind !== 'hole-array') continue
        const radius = cut.diameter / 2
        if (
          cut.start.x - radius < 0 ||
          cut.start.x + radius > part.length ||
          cut.start.y - radius < 0 ||
          cut.start.y + (cut.count - 1) * cut.pitch + radius > part.width ||
          cut.depth <= 0 ||
          cut.depth > part.thickness
        )
          throw Error(
            `Opening ${targets.find((t) => t.id === key)!.number}: pin drilling extends outside a boundary panel.`,
          )
        result.pinBores += cut.count
      }
      for (const p of parts) {
        const rows = drilling.filter((d) => d.part.id === p.id).map((d) => d.cut)
        if (
          rows.length === 2 &&
          rows.every((r) => r.kind === 'hole-array') &&
          Math.abs(rows[0].start.x - rows[1].start.x) < 5
        )
          throw Error(
            `Opening ${targets.find((t) => t.id === key)!.number}: front and rear pin rows overlap.`,
          )
      }
      result.beforeBoards += scene.parts.filter(
        (p) =>
          p.kind === 'board' &&
          p.parentId === id &&
          prefixes.some((prefix) => p.role?.startsWith(prefix)),
      ).length
      result.boards.push(
        ...[...fixed, ...adjustable].map((p) => ({
          role: p.role!,
          label: p.label,
          size: `${p.length} × ${p.width} × ${p.thickness} mm`,
        })),
      )
    }
    const before = carcaseHardware(scene).filter((row) => row.componentId === id),
      after = carcaseHardware(next).filter((row) => row.componentId === id)
    const quantity = (rows: typeof before, key: string) =>
      rows.filter((r) => r.key === key).reduce((n, r) => n + r.qty, 0)
    result.hardware = [...new Set([...before, ...after].map((r) => r.key))]
      .map((key) => ({ key, before: quantity(before, key), after: quantity(after, key) }))
      .filter((r) => r.before !== r.after)
    result.scene = next
    result.changed = true
  } catch (cause) {
    result.errors = [cause instanceof Error ? cause.message : 'Interior preview failed.']
  }
  return result
}
export function acceptInteriors(scene: Scene, preview: InteriorsPreview): Scene | null {
  if (preview.errors.length || !preview.changed || frontsSignature(scene) !== preview.signature)
    return null
  const checked = previewInteriors(scene, preview.cabinetId, preview.draft)
  return checked.errors.length || !checked.changed ? null : checked.scene
}
