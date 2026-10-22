import type { CarcaseComponent, Grain, Scene } from './types'
import type { ProjectStructure } from './projectStructure'
import { pullTargets, type PullTarget } from './pullLayout'
import { cabinetSpaceBox } from '../geom/assembly'
import { resolveWorldMatrix } from '../geom/transform'
import { cutSizeOf, edgesOf } from './edgeBanding'
import {
  grainMatchDraftError,
  grainMatchesError,
  type GrainMatchDraft,
  type GrainMatchGroup,
  type GrainMatchBinding,
} from './grainMatchRecipe'
const EPS = 0.00001
const rounded = (n: number) => Math.round(n * 1e6) / 1e6
export interface GrainFront extends PullTarget {
  cabinetId: string
  cabinetLabel: string
  issue?: string
}
export function grainFronts(scene: Scene): GrainFront[] {
  return scene.components.flatMap((c) => {
    if (c.kind !== 'carcase') return []
    try {
      return pullTargets(scene, c.id).map((t) => ({
        ...t,
        cabinetId: c.id,
        cabinetLabel: c.label,
        issue: t.locked
          ? 'Detached fronts or drawer parts are unsupported.'
          : t.part.cuts.some((c) => c.kind === 'mitre')
            ? 'Mitred fronts are unsupported.'
            : undefined,
      }))
    } catch {
      return []
    }
  })
}
export function defaultGrainMatchDraft(): GrainMatchDraft {
  return {
    label: 'Matched fronts',
    memberIds: [],
    referenceId: '',
    direction: 'vertical',
    origin: 'blank',
    offsetX: 0,
    offsetY: 0,
    margin: 10,
    gap: 14,
  }
}
export interface GrainPanel {
  id: string
  label: string
  sequence: number
  x: number
  y: number
  width: number
  height: number
  sourceX: number
  sourceY: number
  installedX: number
  installedY: number
  finishedWidth: number
  finishedHeight: number
}
export interface GrainLayout {
  group: GrainMatchGroup
  material: string
  thickness: number
  blankWidth: number
  blankHeight: number
  patternX: number
  patternY: number
  panels: GrainPanel[]
}
export const grainMatchSignature = (scene: Scene, project: ProjectStructure) =>
  JSON.stringify([scene, project])
export function grainMatchLayout(scene: Scene, group: GrainMatchGroup): GrainLayout {
  const error = grainMatchDraftError(group.draft)
  if (error) throw Error(error)
  const d = group.draft,
    fronts = grainFronts(scene),
    map = new Map(scene.components.map((c) => [c.id, c]))
  const members = d.memberIds.map((id) => {
    const t = fronts.find((t) => t.id === id)
    if (!t) throw Error(`Front ${id} is missing or no longer a supported front.`)
    if (t.issue) throw Error(`${t.label}: ${t.issue}`)
    return t
  })
  const reference = members.find((t) => t.id === d.referenceId)!,
    cab = map.get(reference.cabinetId) as CarcaseComponent,
    frame = resolveWorldMatrix(cab, map)
  if (Math.abs(frame[2]) > EPS || Math.abs(frame[6]) > EPS || Math.abs(frame[10] - 1) > EPS)
    throw Error('Matching requires upright cabinet frames.')
  const material = reference.part.material,
    thickness = reference.part.thickness
  if (
    !material ||
    !(Number.isFinite(thickness) && thickness > 0) ||
    !((scene.materials[material]?.thickness ?? 0) > 0)
  )
    throw Error('Choose a resolved panel material with positive thickness.')
  const boxes = members.map((t) => {
    const cm = resolveWorldMatrix(map.get(t.cabinetId)!, map)
    if ([0, 1, 2, 4, 5, 6, 8, 9, 10].some((k) => Math.abs(cm[k] - frame[k]) > EPS))
      throw Error('Matching requires parallel fronts facing the same direction.')
    if (t.part.material !== material) throw Error('All matched fronts must use the same material.')
    if (Math.abs(t.part.thickness - thickness) > EPS)
      throw Error('All matched fronts must use the same thickness.')
    const b = cabinetSpaceBox(t.part, map, cab),
      edges = edgesOf(t.part, map, scene.materials),
      cut = cutSizeOf(t.part, edges, scene.materials)
    if (cut.problem) throw Error(cut.problem)
    for (const stock of Object.values(edges))
      if (stock !== null && !((scene.materials[stock]?.thickness ?? 0) > 0))
        throw Error('Edge stock must have positive thickness.')
    const tape = (key: keyof typeof edges) =>
      edges[key] === null ? 0 : (scene.materials[edges[key]!]?.thickness ?? 0)
    return { t, b, cut, left: tape('y0'), top: tape('x1') }
  })
  const plane = boxes.find((b) => b.t.id === d.referenceId)!.b.min.y
  if (boxes.some((b) => Math.abs(b.b.min.y - plane) > EPS || !b.b.axisAligned))
    throw Error('Matched fronts must share one rectangular front plane.')
  const minX = Math.min(...boxes.map((r) => r.b.min.x)),
    maxZ = Math.max(...boxes.map((r) => r.b.max.z))
  const xs = [...new Set(boxes.map((r) => rounded(r.b.min.x)))].sort((a, b) => a - b),
    ys = [...new Set(boxes.map((r) => rounded(maxZ - r.b.max.z)))].sort((a, b) => a - b)
  if (Math.abs((scene.materials[material]?.thickness ?? 0) - thickness) > EPS)
    throw Error('Front thickness does not match panel stock thickness.')
  const panels = boxes
    .map((r) => {
      const installedX = rounded(r.b.min.x - minX),
        installedY = rounded(maxZ - r.b.max.z)
      return {
        id: r.t.id,
        label: r.t.label,
        sequence: 0,
        installedX,
        installedY,
        sourceX: rounded(d.margin + installedX + xs.indexOf(rounded(r.b.min.x)) * d.gap),
        sourceY: rounded(d.margin + installedY + ys.indexOf(installedY) * d.gap),
        finishedWidth: rounded(r.b.max.x - r.b.min.x),
        finishedHeight: rounded(r.b.max.z - r.b.min.z),
        x: rounded(d.margin + installedX + xs.indexOf(rounded(r.b.min.x)) * d.gap + r.left),
        y: rounded(d.margin + installedY + ys.indexOf(installedY) * d.gap + r.top),
        width: r.cut.width,
        height: r.cut.length,
      }
    })
    .sort(
      (a, b) =>
        a.installedY - b.installedY || a.installedX - b.installedX || a.id.localeCompare(b.id),
    )
  panels.forEach((p, i) => (p.sequence = i + 1))
  for (let i = 0; i < panels.length; i++)
    for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i],
        b = panels[j]
      if (
        a.installedX < b.installedX + b.finishedWidth - EPS &&
        a.installedX + a.finishedWidth > b.installedX + EPS &&
        a.installedY < b.installedY + b.finishedHeight - EPS &&
        a.installedY + a.finishedHeight > b.installedY + EPS
      )
        throw Error('Installed front rectangles overlap.')
      if (
        a.x < b.x + b.width - EPS &&
        a.x + a.width > b.x + EPS &&
        a.y < b.y + b.height - EPS &&
        a.y + a.height > b.y + EPS
      )
        throw Error('Cutting-gap layout overlaps. Refine the selected arrangement.')
    }
  const blankWidth = rounded(Math.max(...panels.map((p) => p.x + p.width)) + d.margin),
    blankHeight = rounded(Math.max(...panels.map((p) => p.y + p.height)) + d.margin)
  if (![blankWidth, blankHeight].every((n) => Number.isFinite(n) && n > 0 && n <= 100000))
    throw Error('Shared blank must have positive bounded dimensions up to 100000 mm.')
  const ref = panels.find((p) => p.id === d.referenceId)!
  return {
    group,
    material,
    thickness,
    blankWidth,
    blankHeight,
    panels,
    patternX: rounded((d.origin === 'reference' ? ref.x : 0) + d.offsetX),
    patternY: rounded((d.origin === 'reference' ? ref.y : blankHeight) + d.offsetY),
  }
}
export function grainMatchIssues(scene: Scene, group: GrainMatchGroup): string[] {
  try {
    grainMatchLayout(scene, group)
    return []
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)]
  }
}
export function regenerateGrainMatches(scene: Scene): Scene {
  if (!scene.grainMatches?.length && !scene.parts.some((p) => p.kind === 'board' && p.grainMatch))
    return scene
  const bindings = new Map<string, GrainMatchBinding>(),
    grains = new Map<string, Grain>()
  const error = grainMatchesError(scene.grainMatches ?? [])
  if (error)
    return {
      ...scene,
      parts: scene.parts.map((p) =>
        p.kind === 'board' && p.grainMatch
          ? { ...p, grainMatch: { ...p.grainMatch, problem: error.slice(0, 200) } }
          : p,
      ),
    }
  for (const group of scene.grainMatches ?? []) {
    let layout: GrainLayout | undefined,
      problem = error
    if (!problem)
      try {
        layout = grainMatchLayout(scene, group)
      } catch (e) {
        problem = e instanceof Error ? e.message : String(e)
      }
    for (const [i, id] of group.draft.memberIds.entries()) {
      const p = layout?.panels.find((p) => p.id === id)
      bindings.set(id, {
        version: 1,
        groupId: group.id,
        label: group.draft.label,
        memberCount: group.draft.memberIds.length,
        sequence: p?.sequence ?? i + 1,
        direction: group.draft.direction,
        x: p?.x ?? 0,
        y: p?.y ?? 0,
        width: p?.width ?? 0,
        height: p?.height ?? 0,
        blankWidth: layout?.blankWidth ?? 0,
        blankHeight: layout?.blankHeight ?? 0,
        patternX: layout?.patternX ?? 0,
        patternY: layout?.patternY ?? 0,
        ...(problem ? { problem: problem.slice(0, 200) } : {}),
      })
      if (layout) grains.set(id, group.draft.direction === 'vertical' ? 'length' : 'width')
    }
  }
  return {
    ...scene,
    parts: scene.parts.map((p) => {
      if (p.kind !== 'board') return p
      const binding = bindings.get(p.id),
        grain = grains.get(p.id)
      const { grainMatch: old, ...rest } = p
      if (!binding) return old ? rest : p
      return {
        ...rest,
        ...(grain ? { grain, overrides: { ...p.overrides, grain } } : {}),
        grainMatch: binding,
      }
    }),
  }
}
export interface GrainMatchPreview {
  signature: string
  draft: GrainMatchDraft
  targetId?: string
  action?: 'save' | 'detach'
  layout: GrainLayout | null
  scene: Scene | null
  errors: string[]
  changed: boolean
}
const canonical = (d: GrainMatchDraft): GrainMatchDraft => ({
  ...structuredClone(d),
  label: d.label.trim(),
  memberIds: [...d.memberIds].sort(),
})
export function previewGrainMatch(
  scene: Scene,
  project: ProjectStructure,
  draft: GrainMatchDraft,
  targetId?: string,
): GrainMatchPreview {
  const p: GrainMatchPreview = {
    signature: grainMatchSignature(scene, project),
    draft: structuredClone(draft),
    targetId,
    layout: null,
    scene: null,
    errors: [],
    changed: false,
  }
  try {
    const error = grainMatchDraftError(draft)
    if (error) throw Error(error)
    const old = scene.grainMatches?.find((g) => g.id === targetId)
    if (targetId && !old) throw Error('The saved grain group is missing.')
    if (!targetId && (scene.grainMatches?.length ?? 0) >= 50)
      throw Error('Use at most 50 grain matching groups.')
    if (
      scene.grainMatches?.some(
        (g) => g.id !== targetId && g.draft.memberIds.some((id) => draft.memberIds.includes(id)),
      )
    )
      throw Error('A front already belongs to another grain group.')
    let id = targetId ?? 'grain-preview'
    while (!targetId && scene.grainMatches?.some((g) => g.id === id)) id += ':'
    const group: GrainMatchGroup = { version: 1, id, draft: canonical(draft) }
    p.layout = grainMatchLayout(scene, group)
    p.scene = regenerateGrainMatches({
      ...scene,
      grainMatches: [...(scene.grainMatches ?? []).filter((g) => g.id !== targetId), group],
    })
    p.changed = !old || JSON.stringify(canonical(old.draft)) !== JSON.stringify(group.draft)
  } catch (e) {
    p.errors.push(e instanceof Error ? e.message : String(e))
  }
  return p
}
export function acceptGrainMatch(
  scene: Scene,
  project: ProjectStructure,
  p: GrainMatchPreview,
  id: string,
): Scene | null {
  if (p.signature !== grainMatchSignature(scene, project)) return null
  if (p.action === 'detach') {
    if (!p.targetId || !scene.grainMatches?.some((g) => g.id === p.targetId)) return null
    const groups = scene.grainMatches.filter((g) => g.id !== p.targetId),
      next: Scene = { ...scene, grainMatches: groups }
    if (!groups.length) delete next.grainMatches
    return regenerateGrainMatches(next)
  }
  if (p.action !== undefined && p.action !== 'save') return null
  const checked = previewGrainMatch(scene, project, p.draft, p.targetId)
  if (checked.errors.length || !checked.changed || !checked.scene) return null
  if (
    !p.targetId &&
    (!id.trim() ||
      scene.grainMatches?.some((g) => g.id === id) ||
      scene.parts.some((p) => p.id === id) ||
      scene.components.some((c) => c.id === id))
  )
    return null
  return regenerateGrainMatches({
    ...checked.scene,
    grainMatches: checked.scene.grainMatches!.map((g) =>
      g.id === checked.layout!.group.id ? { ...g, id: p.targetId ?? id } : g,
    ),
  })
}
