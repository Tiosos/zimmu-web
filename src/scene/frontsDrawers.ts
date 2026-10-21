import { RUNNER_NOMINALS } from './hardwareCatalogue'
import { nearestCarcase } from './nearestCarcase'
import { cabinetSpaceBox } from '../geom/assembly'
import type { CarcaseComponent, DrawerComponent, DrawerParams, FrameZone, Scene } from './types'
import type { FrontSpec, Rect } from './sectionTree'
import { resolveCarcase } from './carcaseOpenings'
import { openingGeometry } from './openingLayouts'
import { frontGeometryOf } from './carcaseLayout'
import { frontCells, frontRoleOf } from './frontCells'
import { setFrontOn } from './sectionInterior'
import { finishingMaterials, finishingSignature } from './finishingPanels'
import { applyPipeline } from './pipeline'
import { carcaseHardware } from './carcaseHardware'
import { defaultDrawerParams } from './drawerBox'

export const FRONT_CHOICES = [
  ['left-door', 'Left-hinged door'],
  ['right-door', 'Right-hinged door'],
  ['double-door', 'Double doors'],
  ['drawer-front', 'Drawer front'],
  ['false-front', 'False front'],
  ['panel', 'Cover panel'],
  ['none', 'Remove front'],
] as const
export type FrontChoice = (typeof FRONT_CHOICES)[number][0]
export interface FrontTarget {
  id: string
  sectionId: string
  openingId: string
  frame: boolean
  rect: Rect
  front?: FrontSpec
  locked: boolean
}
export interface FrontsDraft {
  fronts: Record<string, FrontChoice>
  drawers: Record<string, Partial<DrawerParams>>
}
export interface FrontsPreview {
  signature: string
  cabinetId: string
  draft: FrontsDraft
  scene: Scene | null
  errors: string[]
  changed: boolean
  hardware: { key: string; before: number; after: number }[]
  boards: { key: string; before: string; after: string }[]
}
const cabinetOf = (scene: Scene, id: string): CarcaseComponent => {
  const c = scene.components.find((c) => c.id === id)
  if (c?.kind !== 'carcase') throw Error('The cabinet is no longer available.')
  return c
}
export function frontChoice(front?: FrontSpec): FrontChoice {
  return !front
    ? 'none'
    : front.kind === 'door'
      ? front.leaves === 2
        ? 'double-door'
        : front.hinge === 'left'
          ? 'left-door'
          : 'right-door'
      : front.kind
}
const specOf = (choice: FrontChoice): FrontSpec | undefined =>
  choice === 'none'
    ? undefined
    : choice === 'left-door' || choice === 'right-door' || choice === 'double-door'
      ? {
          kind: 'door',
          leaves: choice === 'double-door' ? 2 : 1,
          hinge: choice === 'right-door' ? 'right' : 'left',
        }
      : { kind: choice }
export const emptyFrontsDraft = (): FrontsDraft => ({ fronts: {}, drawers: {} })
const copy = (d: FrontsDraft): FrontsDraft => ({
  fronts: { ...d.fronts },
  drawers: Object.fromEntries(Object.entries(d.drawers).map(([id, p]) => [id, { ...p }])),
})
export function frontsSignature(scene: Scene): string {
  return JSON.stringify({
    geometry: finishingSignature(scene),
    drawers: scene.components
      .filter((c) => c.kind === 'drawer')
      .map((c) => ({
        id: c.id,
        params: c.params,
        driven: c.driven,
        sectionId: c.sectionId,
        openingId: c.frameOpeningId,
      })),
    ownership: scene.parts.map((p) => ({ id: p.id, role: p.role, driven: p.driven })),
    rules: scene.cabinetRules,
    catalogues: scene.companyCatalogues,
  })
}
const drawerFor = (scene: Scene, cabinetId: string, t: FrontTarget) =>
  scene.components.find(
    (c): c is DrawerComponent =>
      c.kind === 'drawer' &&
      c.parentId === cabinetId &&
      c.sectionId === t.sectionId &&
      (c.frameOpeningId ?? c.sectionId) === t.openingId,
  )
export function frontTargets(scene: Scene, cabinetId: string): FrontTarget[] {
  const c = cabinetOf(scene, cabinetId)
  const errors = openingGeometry(c.params, scene.materials, scene.parts, c.id).errors
  if (errors.length) throw Error(errors.join('; '))
  const resolved = resolveCarcase(c, scene.parts, scene.materials)
  if (!resolved) throw Error('The cabinet openings cannot be resolved.')
  const geometry = frontGeometryOf(c.params, resolved.tree)
  const cells = frontCells(c.params.section, resolved.tree, geometry)
  const targets: FrontTarget[] = []
  const add = (
    sectionId: string,
    openingId: string,
    frame: boolean,
    rect: Rect,
    front?: FrontSpec,
  ) => {
    const roles = new Set(
      cells
        .filter((cell) => cell.sectionId === sectionId && cell.openingId === openingId)
        .map(frontRoleOf),
    )
    const target: FrontTarget = {
      id: JSON.stringify([sectionId, openingId]),
      sectionId,
      openingId,
      frame,
      rect,
      front,
      locked: false,
    }
    const drawer = drawerFor(scene, cabinetId, target)
    target.locked =
      scene.parts.some(
        (p) => p.parentId === c.id && p.role !== undefined && roles.has(p.role) && !p.driven,
      ) ||
      (!!drawer &&
        (!drawer.driven || scene.parts.some((p) => p.parentId === drawer.id && !p.driven)))
    targets.push(target)
  }
  for (const o of resolved.openings) {
    const zone = c.params.frame?.layout?.[o.sectionId]
    if (zone) {
      const walk = (z: FrameZone) => {
        if (z.content.kind === 'split') {
          z.content.children.forEach(walk)
          return
        }
        const physical = geometry.frameAccessOpenings?.get(z.id)
        if (!physical) throw Error('A frame opening is unavailable.')
        add(o.sectionId, z.id, true, physical.rect, z.front)
      }
      walk(zone)
    } else
      add(
        o.sectionId,
        o.sectionId,
        false,
        geometry.frameOpenings?.get(o.sectionId) ?? o.rect,
        o.section.front,
      )
  }
  return targets.sort((a, b) => a.rect.x0 - b.rect.x0 || a.rect.z0 - b.rect.z0)
}
function selected(scene: Scene, cabinetId: string, ids: string[]): FrontTarget[] {
  if (!ids.length || new Set(ids).size !== ids.length)
    throw Error('Select distinct openings first.')
  const targets = frontTargets(scene, cabinetId)
  return ids.map((id) => {
    const t = targets.find((t) => t.id === id)
    if (!t) throw Error('A selected opening is no longer available.')
    if (t.locked) throw Error('Detached front or drawer parts lock this opening.')
    return t
  })
}
export function stageFront(
  scene: Scene,
  cabinetId: string,
  draft: FrontsDraft,
  ids: string[],
  choice: FrontChoice,
): FrontsDraft {
  if (!FRONT_CHOICES.some(([value]) => value === choice)) throw Error('Choose a supported front.')
  const targets = selected(scene, cabinetId, ids),
    next = copy(draft)
  for (const t of targets) {
    next.fronts[t.id] = choice
    if (choice !== 'drawer-front') delete next.drawers[t.id]
  }
  return next
}
export type DrawerAction =
  | { kind: 'nominal'; value: string | null }
  | { kind: 'family'; value: 'side-mount' | 'undermount' }
  | { kind: 'height'; value: string | null }
  | { kind: 'offset'; value: string }
  | { kind: 'material'; value: string }
const number = (raw: string) => {
  const n = raw.trim() ? Number(raw) : NaN
  if (!Number.isFinite(n)) throw Error('Complete the drawer setting with a finite number.')
  return n
}
function validatePatch(scene: Scene, p: Partial<DrawerParams>): void {
  if (p.nominal !== undefined && p.nominal !== null && !(RUNNER_NOMINALS as readonly number[]).includes(p.nominal)) throw Error('Choose a supported runner nominal.')
  if (p.family !== undefined && !['side-mount', 'undermount'].includes(p.family))
    throw Error('Unsupported runner family.')
  if (
    p.boxHeight !== undefined &&
    p.boxHeight !== null &&
    (!Number.isFinite(p.boxHeight) || p.boxHeight <= 0)
  )
    throw Error('Custom box height must be positive and finite.')
  if (p.runnerOffset !== undefined && (!Number.isFinite(p.runnerOffset) || p.runnerOffset < 0))
    throw Error('Runner offset must be zero or greater and finite.')
  if (
    p.material !== undefined &&
    p.material !== '' &&
    !finishingMaterials(scene).includes(p.material)
  )
    throw Error('Choose an existing panel material for the drawer box.')
}
export function stageDrawer(
  scene: Scene,
  cabinetId: string,
  draft: FrontsDraft,
  ids: string[],
  action: DrawerAction,
): FrontsDraft {
  const targets = selected(scene, cabinetId, ids),
    next = copy(draft)
  const patch: Partial<DrawerParams> =
    action.kind === 'nominal'
      ? { nominal: action.value === null ? null : number(action.value) }
      : action.kind === 'family'
      ? { family: action.value }
      : action.kind === 'height'
        ? { boxHeight: action.value === null ? null : number(action.value) }
        : action.kind === 'offset'
          ? { runnerOffset: number(action.value) }
          : { material: action.value }
  validatePatch(scene, patch)
  for (const t of targets) {
    if ((draft.fronts[t.id] ?? frontChoice(t.front)) !== 'drawer-front')
      throw Error('Select only drawer-front openings for drawer settings.')
    const family =
      draft.drawers[t.id]?.family ?? drawerFor(scene, cabinetId, t)?.params.family ?? 'side-mount'
    if (action.kind === 'offset' && family !== 'side-mount')
      throw Error('Runner offset is available only for side-mount drawers.')
    next.drawers[t.id] = { ...next.drawers[t.id], ...patch }
    if (action.kind === 'family' && action.value === 'undermount')
      delete next.drawers[t.id].runnerOffset
  }
  return next
}
function setZoneFront(zone: FrameZone, id: string, front?: FrontSpec): FrameZone {
  if (zone.id === id) {
    const next = { ...zone }
    if (front) next.front = front
    else delete next.front
    return next
  }
  return zone.content.kind === 'leaf'
    ? zone
    : {
        ...zone,
        content: {
          ...zone.content,
          children: zone.content.children.map((z) => setZoneFront(z, id, front)),
        },
      }
}
function boardRows(scene: Scene, cabinetId: string): Map<string, string> {
  const byId = new Map(scene.components.map((c) => [c.id, c]))
  const drawers = new Map(
    scene.components
      .filter((c): c is DrawerComponent => c.kind === 'drawer' && c.parentId === cabinetId)
      .map((c) => [c.id, c]),
  )
  return new Map(
    scene.parts
      .filter((p) => p.kind === 'board' && nearestCarcase(p, byId)?.id === cabinetId)
      .map((p) => {
        const d = drawers.get(p.parentId ?? ''),
          parent = byId.get(p.parentId ?? ''),
          owner = d
            ? d.sectionId === null
              ? d.id
              : JSON.stringify([d.sectionId, d.frameOpeningId ?? d.sectionId])
            : parent?.kind === 'faceFrame' && parent.driven
              ? `frame:${cabinetId}`
              : (p.parentId ?? cabinetId)
        return [
          `${owner}:${p.role ?? p.id}`,
          p.kind === 'board'
            ? `${p.label}: ${p.length.toFixed(2)} × ${p.width.toFixed(2)} × ${p.thickness.toFixed(2)} mm; ${p.material}`
            : '',
        ]
      }),
  )
}
export function previewFronts(scene: Scene, cabinetId: string, draft: FrontsDraft): FrontsPreview {
  const result: FrontsPreview = {
    signature: frontsSignature(scene),
    cabinetId,
    draft: copy(draft),
    scene: null,
    errors: [],
    changed: false,
    hardware: [],
    boards: [],
  }
  try {
    const original = cabinetOf(scene, cabinetId),
      ids = [...new Set([...Object.keys(draft.fronts), ...Object.keys(draft.drawers)])]
    if (!ids.length) {
      result.scene = scene
      return result
    }
    if (
      ![...Object.values(original.position), ...Object.values(original.rotation)].every(
        Number.isFinite,
      )
    )
      throw Error('Cabinet placement must be finite.')
    const targets = selected(scene, cabinetId, ids)
    let params = original.params
    for (const t of targets) {
      const choice = draft.fronts[t.id]
      if (choice === undefined) continue
      if (!FRONT_CHOICES.some(([value]) => value === choice))
        throw Error('Choose a supported front.')
      if (choice === frontChoice(t.front)) continue
      const front = specOf(choice)
      params = t.frame
        ? {
            ...params,
            frame: {
              ...params.frame!,
              layout: {
                ...params.frame!.layout,
                [t.sectionId]: setZoneFront(params.frame!.layout![t.sectionId], t.openingId, front),
              },
            },
          }
        : { ...params, section: setFrontOn(params.section, t.sectionId, front) }
    }
    const proposedCabinet = { ...original, params }
    const geometry = openingGeometry(params, scene.materials, scene.parts, cabinetId).errors
    if (geometry.length) throw Error(geometry.join('; '))
    let proposed = applyPipeline({
      ...scene,
      components: scene.components.map((c) => (c.id === cabinetId ? proposedCabinet : c)),
    })
    for (const t of targets) {
      const patch = draft.drawers[t.id]
      if (!patch) continue
      validatePatch(scene, patch)
      const actual = frontTargets(proposed, cabinetId).find((a) => a.id === t.id)
      if (actual?.front?.kind !== 'drawer-front')
        throw Error('Drawer settings require a drawer-front opening.')
      const drawer = drawerFor(proposed, cabinetId, t)
      if (!drawer || !drawer.driven) throw Error('The drawer is unavailable or detached.')
      if (
        patch.runnerOffset !== undefined &&
        (patch.family ?? drawer.params.family) !== 'side-mount'
      )
        throw Error('Runner offset is available only for side-mount drawers.')
      proposed = {
        ...proposed,
        components: proposed.components.map((c) =>
          c.id === drawer.id ? { ...drawer, params: { ...drawer.params, ...patch } } : c,
        ),
      }
    }
    proposed = applyPipeline(proposed)
    const finalTargets = frontTargets(proposed, cabinetId)
    for (const t of targets) {
      const actual = finalTargets.find((a) => a.id === t.id)
      if (!actual) throw Error('The proposed opening is unavailable.')
      if (actual.front?.kind === 'drawer-front') {
        const drawer = drawerFor(proposed, cabinetId, t)
        if (drawer) validatePatch(scene, drawer.params)
        const height = actual.rect.z1 - actual.rect.z0
        if (!drawer || (drawer.params.boxHeight !== null && drawer.params.boxHeight > height))
          throw Error('Custom drawer-box height exceeds the opening.')
        const roles = new Set(
          proposed.parts.filter((p) => p.parentId === drawer?.id).map((p) => p.role),
        )
        if (
          ['box-left', 'box-right', 'box-front', 'box-back', 'box-bottom'].some(
            (role) => !roles.has(role),
          )
        )
          throw Error('The drawer box or supported runner does not fit this opening.')
      }
      if (actual.front?.kind === 'drawer-front') {
        const drawer = drawerFor(proposed, cabinetId, t)!
        const byId = new Map(proposed.components.map((c) => [c.id, c]))
        const own = cabinetOf(proposed, cabinetId)
        const boxes = proposed.parts
          .filter((p) => p.parentId === drawer.id)
          .map((p) => cabinetSpaceBox(p, byId, own))
        const min = {
          x: Math.min(...boxes.map((b) => b.min.x)),
          y: Math.min(...boxes.map((b) => b.min.y)),
          z: Math.min(...boxes.map((b) => b.min.z)),
        }
        const max = {
          x: Math.max(...boxes.map((b) => b.max.x)),
          y: Math.max(...boxes.map((b) => b.max.y)),
          z: Math.max(...boxes.map((b) => b.max.z)),
        }
        const resolved = resolveCarcase(own, proposed.parts, proposed.materials)!
        const shelves =
          resolved.nodes.sections
            .find((s) => s.sectionId === t.sectionId)
            ?.parts.filter(
              (p) => p.role?.startsWith('adj-shelf-') || p.role?.startsWith('fixed-shelf-'),
            ) ?? []
        if (
          shelves.some((p) => {
            const b = cabinetSpaceBox(p, byId, own)
            return (['x', 'y', 'z'] as const).every(
              (axis) => Math.min(max[axis], b.max[axis]) - Math.max(min[axis], b.min[axis]) > 1e-6,
            )
          })
        )
          throw Error(
            'The drawer box intersects a shelf. Reduce box height or adjust shelving in Section.',
          )
      }
      if (actual.front) {
        const resolved = resolveCarcase(
          cabinetOf(proposed, cabinetId),
          proposed.parts,
          proposed.materials,
        )!
        const cells = frontCells(
          params.section,
          resolved.tree,
          frontGeometryOf(params, resolved.tree),
        ).filter((c) => c.sectionId === t.sectionId && c.openingId === t.openingId)
        if (
          !cells.length ||
          cells.some(
            (cell) =>
              !proposed.parts.some((p) => p.parentId === cabinetId && p.role === frontRoleOf(cell)),
          )
        )
          throw Error('The selected front does not fit this opening.')
      }
    }
    const all = proposed.parts.filter(
      (p) =>
        p.parentId === cabinetId ||
        proposed.components.some(
          (c) => c.kind === 'drawer' && c.parentId === cabinetId && c.id === p.parentId,
        ),
    )
    if (
      all.some(
        (p) =>
          p.kind === 'board' &&
          (![p.length, p.width, p.thickness].every((n) => Number.isFinite(n) && n > 0) ||
            ![...Object.values(p.position), ...Object.values(p.rotation)].every(Number.isFinite)),
      )
    )
      throw Error('Proposed board geometry must be positive and finite.')
    result.changed =
      JSON.stringify(params) !== JSON.stringify(original.params) ||
      targets.some((t) => {
        const p = draft.drawers[t.id]
        const before = drawerFor(scene, cabinetId, t)?.params ?? defaultDrawerParams('side-mount')
        return (
          p && Object.entries(p).some(([key, value]) => before[key as keyof DrawerParams] !== value)
        )
      })
    const before = boardRows(scene, cabinetId),
      after = boardRows(proposed, cabinetId)
    result.boards = [...new Set([...before.keys(), ...after.keys()])]
      .filter((key) => before.get(key) !== after.get(key))
      .map((key) => ({ key, before: before.get(key) ?? '—', after: after.get(key) ?? '—' }))
    const hardware = (s: Scene) =>
      new Map(
        carcaseHardware(s)
          .filter((h) => h.componentId === cabinetId)
          .map((h) => [h.key, h.qty]),
      )
    const hb = hardware(scene),
      ha = hardware(proposed)
    result.hardware = [...new Set([...hb.keys(), ...ha.keys()])]
      .filter((key) => hb.get(key) !== ha.get(key))
      .map((key) => ({ key, before: hb.get(key) ?? 0, after: ha.get(key) ?? 0 }))
    result.scene = proposed
  } catch (error) {
    result.errors = [
      error instanceof Error ? error.message : 'Fronts and drawers could not be built.',
    ]
  }
  return result
}
export function acceptFronts(scene: Scene, preview: FrontsPreview): Scene | null {
  if (preview.errors.length || !preview.changed || preview.signature !== frontsSignature(scene))
    return null
  const checked = previewFronts(scene, preview.cabinetId, preview.draft)
  return checked.errors.length || !checked.changed ? null : checked.scene
}
