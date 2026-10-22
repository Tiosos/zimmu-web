import type { BoardPart, CarcaseComponent, Part, Scene } from './types'
import { cornerDraftError, cornerLinkError, type CornerDraft } from './cornerRecipe'
import { anchoredRunMembers, buildRunWorktop, runPanelDraft, runWorktopDraft } from './runWorktops'
import {
  composeWorldMatrix,
  applyMatrixToPoint,
  applyInverseToPoint,
  decomposeMatrix,
  multiplyMatrix,
} from '../geom/transform'
import { orientedPanel, type LocalBox } from './carcaseLayout'
import { resolveWorktopFeatures } from './worktopMachining'
import { serviceIssues } from './serviceMachining'
import { cutSizeOf, edgesOf } from './edgeBanding'
import { jointInvolves } from './jointInvolves'
import { resolveAppliance } from './applianceBays'
import { cabinetSpaceBox } from '../geom/assembly'
const EPS = 1e-5
const clone = <T>(v: T): T => structuredClone(v)
const signature = (s: Scene) => JSON.stringify(s)
export interface CornerPreview {
  signature: string
  draft: CornerDraft
  targetId?: string
  action?: 'save' | 'detach' | 'delete'
  parts: BoardPart[]
  boxes: LocalBox[]
  errors: string[]
  issues: string[]
  changed: boolean
}
function cabinet(s: Scene, id: string): CarcaseComponent {
  const c = s.components.find((c) => c.id === id)
  if (c?.kind !== 'carcase') throw Error(`Missing corner cabinet: ${id}.`)
  return c
}
export function cornerDraft(s: Scene, id: string, profile?: 'plinth' | 'splashback'): CornerDraft {
  const run = profile ? runPanelDraft(s, id, profile) : runWorktopDraft(s, id)
  return {
    label: 'Corner assembly',
    through: 0,
    gap: '0',
    legs: [
      { run, edges: {}, endReturn: false },
      { run: { ...clone(run), memberIds: [] }, edges: {}, endReturn: false },
    ],
  }
}
export function cornerCandidates(s: Scene, draft: CornerDraft): CornerDraft[] {
  const firstId = draft.legs[0].run.memberIds[0]
  if (!firstId) return []
  const first = s.components.find((c) => c.id === firstId)
  if (first?.kind !== 'carcase') return []
  const candidates: CornerDraft[] = []
  const seen = new Set<string>()
  for (const c of s.components) {
    if (c.kind !== 'carcase' || c.id === firstId || c.parentId !== first.parentId) continue
    const angle = ((c.rotation.z - first.rotation.z) * Math.PI) / 180
    if (Math.abs(Math.cos(angle)) > EPS) continue
    const ids = anchoredRunMembers(s, c.id)
    const key = [...ids].sort().join('\0')
    if (seen.has(key)) continue
    seen.add(key)
    const d = clone(draft)
    d.legs[0].run.memberIds = anchoredRunMembers(s, firstId)
    d.legs[1].run.memberIds = ids
    try {
      build(s, d)
      candidates.push(d)
    } catch {
      /* Not a supported end corner. */
    }
    if (candidates.length === 20) break
  }
  return candidates
}
function boxIn(
  part: BoardPart,
  frame = composeWorldMatrix({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  }),
): LocalBox {
  const m = composeWorldMatrix(part)
  const points = [0, part.length].flatMap((x) =>
    [0, part.width].flatMap((y) =>
      [0, part.thickness].map((z) => applyInverseToPoint(frame, ...applyMatrixToPoint(m, x, y, z))),
    ),
  )
  return {
    x0: Math.min(...points.map((p) => p[0])),
    x1: Math.max(...points.map((p) => p[0])),
    y0: Math.min(...points.map((p) => p[1])),
    y1: Math.max(...points.map((p) => p[1])),
    z0: Math.min(...points.map((p) => p[2])),
    z1: Math.max(...points.map((p) => p[2])),
  }
}
const overlap = (a: LocalBox, b: LocalBox) =>
  (['x', 'y', 'z'] as const).every(
    (k) => a[`${k}0`] < b[`${k}1`] - EPS && a[`${k}1`] > b[`${k}0`] + EPS,
  )
function group(s: Scene, id: string): BoardPart[] {
  return s.parts.filter(
    (p): p is BoardPart => p.kind === 'board' && p.cornerPanel?.assemblyId === id,
  )
}
function complete(parts: BoardPart[]): void {
  if (!parts.length) throw Error('The corner assembly is unavailable.')
  for (const part of parts) {
    const error = cornerLinkError(part.cornerPanel)
    if (error) throw Error(error)
  }
  const d = parts[0].cornerPanel!.draft
  const slots = [0, 1, ...d.legs.flatMap((l, i) => (l.endReturn ? [i + 2] : []))]
  if (
    parts.some(
      (p) =>
        cornerLinkError(p.cornerPanel) ||
        p.driven ||
        p.role !== undefined ||
        p.finishing ||
        p.runWorktop ||
        p.frontPull ||
        JSON.stringify(p.cornerPanel!.draft) !== JSON.stringify(d),
    ) ||
    slots.some((slot) => parts.filter((p) => p.cornerPanel!.slot === slot).length !== 1)
  )
    throw Error(
      'Corner assembly is incomplete or inconsistent. Detach or remove it before rebuilding.',
    )
}
function build(
  s: Scene,
  d: CornerDraft,
): { parts: BoardPart[]; boxes: LocalBox[]; issues: string[] } {
  const error = cornerDraftError(d)
  if (error) throw Error(error)
  const refs = d.legs.map((l) => cabinet(s, l.run.memberIds[0]))
  if (refs[0].parentId !== refs[1].parentId) throw Error('Corner legs must share one container.')
  if (refs.some((c) => Math.abs(c.rotation.x) > EPS || Math.abs(c.rotation.y) > EPS))
    throw Error('Corner cabinets must be upright in their shared container.')
  const angle = ((refs[1].rotation.z - refs[0].rotation.z) * Math.PI) / 180
  if (Math.abs(Math.cos(angle)) > EPS)
    throw Error('Choose perpendicular cabinet runs (90° or 270°).')
  const frame = composeWorldMatrix(refs[0])
  const legs = d.legs.map((l) => buildRunWorktop(s, l.run, 1))
  const boxes = legs.map((l) => boxIn(l.part!, frame))
  if (Math.abs(boxes[0].z0 - boxes[1].z0) > EPS || Math.abs(boxes[0].z1 - boxes[1].z1) > EPS)
    throw Error('Corner boards must have matching bottom and top planes.')
  const original = clone(boxes)
  const centre = (b: LocalBox, axis: 'x' | 'y') => (b[`${axis}0`] + b[`${axis}1`]) / 2
  const axes = ['x', 'y'] as const
  const ends: (0 | 1)[] = boxes.map((b, i) =>
    centre(boxes[1 - i], axes[i]) < centre(b, axes[i]) ? 0 : 1,
  )
  const reach =
    Math.max(...refs.map((c) => c.params.depth)) +
    Math.max(...legs.map((l) => l.part!.thickness)) +
    Math.max(
      ...d.legs.map((l) => Number(l.run.front) + Number(l.run.rear) + Number(l.run.setback ?? 0)),
    ) +
    Math.max(...d.legs.map((l) => Number(l.run.maxGap)))
  for (let i = 0; i < 2; i++) {
    const axis = axes[i],
      other = boxes[1 - i],
      b = boxes[i],
      end = ends[i]
    if (Math.abs(b[`${axis}${end}`] - centre(other, axis)) > reach + EPS)
      throw Error('Runs do not meet at an end corner; reposition them before joining.')
    const through = d.through === i
    b[`${axis}${end}`] =
      other[`${axis}${(through ? end : 1 - end) as 0 | 1}`] +
      (through ? 0 : end === 0 ? Number(d.gap) : -Number(d.gap))
    if (b[`${axis}1`] - b[`${axis}0`] <= EPS)
      throw Error('The corner joint consumes an entire leg.')
  }
  if (overlap(boxes[0], boxes[1])) throw Error('Corner boards overlap after joint resolution.')
  const slots: { slot: 0 | 1 | 2 | 3; box: LocalBox; leg: number; axis: 'y' | 'x' | 'z' }[] =
    boxes.map((box, i) => ({
      slot: i as 0 | 1,
      box,
      leg: i,
      axis: d.legs[i].run.profile ? (i === 0 ? 'y' : 'x') : 'z',
    }))
  for (let i = 0; i < 2; i++) {
    if (!d.legs[i].endReturn) continue
    const b = boxes[i],
      axis = axes[i],
      depthAxis = axes[1 - i],
      end = (1 - ends[i]) as 0 | 1
    const runBounds = legs[i].members.map((m) => m.bounds)
    const reference = composeWorldMatrix(refs[i])
    const farY =
      d.legs[i].run.profile === 'plinth'
        ? Math.max(...runBounds.map((b) => b.y1))
        : Math.min(...runBounds.map((b) => b.y0))
    const far = applyInverseToPoint(frame, ...applyMatrixToPoint(reference, 0, farY, 0))[
      i === 0 ? 1 : 0
    ]
    const thickness = legs[i].part!.thickness
    const box = {
      ...b,
      [`${axis}0`]: b[`${axis}${end}`] + (end === 0 ? -thickness : 0),
      [`${axis}1`]: b[`${axis}${end}`] + (end === 0 ? 0 : thickness),
      [`${depthAxis}0`]: Math.min(far, b[`${depthAxis}0`]),
      [`${depthAxis}1`]: Math.max(far, b[`${depthAxis}1`]),
    }
    if (box[`${depthAxis}1`] - box[`${depthAxis}0`] <= EPS)
      throw Error('End return has no positive depth.')
    slots.push({ slot: (i + 2) as 2 | 3, box, leg: i, axis })
  }
  const parts = slots.map(({ slot, box, leg, axis }) => {
    const legFrame = composeWorldMatrix(refs[leg])
    const localPoints = [box.x0, box.x1].flatMap((x) =>
      [box.y0, box.y1].flatMap((y) =>
        [box.z0, box.z1].map((z) =>
          applyInverseToPoint(legFrame, ...applyMatrixToPoint(frame, x, y, z)),
        ),
      ),
    )
    const local = {
      x0: Math.min(...localPoints.map((p) => p[0])),
      x1: Math.max(...localPoints.map((p) => p[0])),
      y0: Math.min(...localPoints.map((p) => p[1])),
      y1: Math.max(...localPoints.map((p) => p[1])),
      z0: Math.min(...localPoints.map((p) => p[2])),
      z1: Math.max(...localPoints.map((p) => p[2])),
    }
    const spec = orientedPanel(local, axis === 'z' ? 'z' : slot < 2 ? 'y' : 'x')
    const transform = decomposeMatrix(multiplyMatrix(legFrame, composeWorldMatrix(spec)))
    const source = legs[leg].part!
    const part: BoardPart = {
      ...source,
      ...spec,
      position: transform.position,
      rotation: transform.rotation,
      id: `corner-preview-${slot}`,
      label: `${d.label.trim()} · ${slot < 2 ? `leg ${leg + 1}` : `end return ${leg + 1}`}`,
      runWorktop: undefined,
      edgeBanding: clone(d.legs[leg].edges),
      cornerPanel: { version: 1, assemblyId: 'preview', slot, draft: clone(d) },
    }
    const size = cutSizeOf(
      part,
      edgesOf(part, new Map(s.components.map((c) => [c.id, c])), s.materials),
      s.materials,
    )
    if (
      ![part.length, part.width, part.thickness].every(
        (v) => Number.isFinite(v) && v > EPS && v <= 100000,
      )
    )
      throw Error('Corner boards must have positive finite dimensions up to 100000 mm.')
    if (size.problem) throw Error(size.problem)
    for (const stock of Object.values(part.edgeBanding ?? {}))
      if (stock !== null && stock !== undefined && !((s.materials[stock]?.thickness ?? 0) > 0))
        throw Error('Edge stock must have positive thickness.')
    return part
  })
  const allBoxes = slots.map((s) => s.box)
  for (let i = 0; i < allBoxes.length; i++)
    for (let j = i + 1; j < allBoxes.length; j++)
      if (overlap(allBoxes[i], allBoxes[j]))
        throw Error('End returns overlap another corner board.')
  const issues: string[] = []
  for (let i = 0; i < 2; i++) {
    const axis = axes[i],
      end = ends[i]
    const delta = (boxes[i][`${axis}${end}`] - original[i][`${axis}${end}`]) * (end === 0 ? -1 : 1)
    if (delta > EPS)
      issues.push(
        `Leg ${i + 1} extends ${delta.toFixed(2)} mm beyond its original run board; verify support.`,
      )
    if (delta < -EPS)
      issues.push(
        `Leg ${i + 1} is shortened ${(-delta).toFixed(2)} mm at the joint; verify cabinet coverage.`,
      )
  }
  if (Number(d.gap) > 0) issues.push(`The joint has an intentional ${Number(d.gap)} mm clearance.`)
  return { parts, boxes: allBoxes, issues }
}
function merge(old: BoardPart, fresh: BoardPart, assemblyId: string): BoardPart {
  return {
    ...old,
    ...fresh,
    id: old.id,
    cuts: old.cuts,
    operations: old.operations,
    visible: old.visible,
    worktopMachining: old.worktopMachining,
    serviceMachining: old.serviceMachining,
    cornerPanel: { ...fresh.cornerPanel!, assemblyId },
  }
}
export function previewCorner(s: Scene, draft: CornerDraft, targetId?: string): CornerPreview {
  const p: CornerPreview = {
    signature: signature(s),
    draft: clone(draft),
    targetId,
    parts: [],
    boxes: [],
    errors: [],
    issues: [],
    changed: false,
  }
  try {
    const existing = targetId ? group(s, targetId) : []
    if (targetId) complete(existing)
    const built = build(s, draft)
    p.parts = built.parts.map((fresh) => {
      const old = existing.find((o) => o.cornerPanel!.slot === fresh.cornerPanel!.slot)
      if (
        old &&
        old.cornerPanel!.draft.legs[0].run.profile !== draft.legs[0].run.profile &&
        (old.cuts.length || old.operations?.length || old.serviceMachining || old.worktopMachining)
      )
        throw Error('Remove machining before changing the assembly profile.')
      return old ? merge(old, fresh, targetId!) : fresh
    })
    if (
      existing.some(
        (o) =>
          !p.parts.some((p) => p.cornerPanel!.slot === o.cornerPanel!.slot) &&
          (o.cuts.length || o.operations?.length || o.serviceMachining),
      )
    )
      throw Error('Remove end-return machining before removing its board.')
    p.boxes = built.boxes
    p.issues = built.issues
    const reference = cabinet(s, draft.legs[0].run.memberIds[0])
    const byId = new Map(s.components.map((c) => [c.id, c]))
    const excluded = new Set(existing.map((p) => p.id))
    for (const other of s.parts) {
      if (other.kind !== 'board' || excluded.has(other.id)) continue
      const bounds = cabinetSpaceBox(other, byId, reference)
      const box = {
        x0: bounds.min.x,
        x1: bounds.max.x,
        y0: bounds.min.y,
        y1: bounds.max.y,
        z0: bounds.min.z,
        z1: bounds.max.z,
      }
      if (p.boxes.some((b) => overlap(b, box)))
        p.issues.push(
          `Interference with existing board: ${other.label}${bounds.axisAligned ? '' : ' (conservative rotated bounds)'}.`,
        )
    }
    const proposed = { ...s, parts: [...s.parts.filter((p) => !excluded.has(p.id)), ...p.parts] }
    for (const part of p.parts) {
      if (part.cuts.some((c) => c.kind === 'mitre'))
        throw Error('Remove mitre machining before editing a square corner assembly.')
      if (part.worktopMachining)
        for (const row of resolveWorktopFeatures(part, part.worktopMachining))
          p.issues.push(...row.errors.map((e) => `${part.label}: ${e}`))
      p.issues.push(...serviceIssues(proposed, part).map((e) => `${part.label}: ${e}`))
      if (part.cuts.length)
        p.issues.push(
          `${part.label}: retained machining requires joint-edge and board-boundary review.`,
        )
    }
    const members = new Set(draft.legs.flatMap((l) => l.run.memberIds))
    for (const bay of s.applianceBays ?? [])
      if (members.has(bay.cabinetId)) {
        const resolved = resolveAppliance(proposed, bay)
        p.issues.push(
          ...resolved.issues
            .filter((i) => i.includes('Corner') || i.includes(draft.label.trim()))
            .map((i) => `${bay.label}: ${i}`),
        )
      }
    p.issues = [...new Set(p.issues)]
    p.changed =
      !targetId || JSON.stringify(existing[0].cornerPanel!.draft) !== JSON.stringify(draft)
  } catch (e) {
    p.errors = [e instanceof Error ? e.message : 'Corner assembly could not be built.']
  }
  return p
}
export function cornerIssues(s: Scene, id: string): string[] {
  const parts = group(s, id)
  try {
    complete(parts)
    const p = previewCorner(s, parts[0].cornerPanel!.draft, id)
    return [...p.errors, ...p.issues]
  } catch (e) {
    return [e instanceof Error ? e.message : 'Invalid corner assembly.']
  }
}
export function regenerateCorners(s: Scene): Scene {
  let parts = s.parts
  const ids = new Set(
    s.parts.flatMap((p) => (p.kind === 'board' && p.cornerPanel ? [p.cornerPanel.assemblyId] : [])),
  )
  for (const id of ids) {
    const owned = group(s, id)
    try {
      complete(owned)
      const fresh = build(s, owned[0].cornerPanel!.draft).parts
      parts = parts.map((p) =>
        p.kind === 'board' && p.cornerPanel?.assemblyId === id
          ? merge(p, fresh.find((f) => f.cornerPanel!.slot === p.cornerPanel!.slot)!, id)
          : p,
      )
    } catch {
      /* Keep last geometry; the workspace explains invalid links. */
    }
  }
  return { ...s, parts }
}
export function acceptCorner(s: Scene, p: CornerPreview, id: string): Scene | null {
  if (p.signature !== signature(s)) return null
  const old = p.targetId ? group(s, p.targetId) : []
  if (p.action === 'delete' || p.action === 'detach') {
    if (!old.length) return null
    const ids = new Set(old.map((p) => p.id))
    return {
      ...s,
      parts: s.parts.flatMap((part): Part[] =>
        !ids.has(part.id)
          ? [part]
          : p.action === 'delete'
            ? []
            : [{ ...part, cornerPanel: undefined } as BoardPart],
      ),
      joints:
        p.action === 'delete'
          ? s.joints.filter((j) => ![...ids].some((id) => jointInvolves(j, id)))
          : s.joints,
    }
  }
  if (p.action !== undefined && p.action !== 'save') return null
  const checked = previewCorner(s, p.draft, p.targetId)
  if (checked.errors.length || !checked.changed) return null
  const assemblyId = p.targetId ?? id
  if (
    !assemblyId.trim() ||
    (!p.targetId &&
      s.parts.some((p) => p.kind === 'board' && p.cornerPanel?.assemblyId === assemblyId))
  )
    return null
  const next = checked.parts.map((part) => {
    const previous = old.find((o) => o.cornerPanel!.slot === part.cornerPanel!.slot)
    return {
      ...part,
      id: previous?.id ?? `${assemblyId}_${part.cornerPanel!.slot}`,
      cornerPanel: { ...part.cornerPanel!, assemblyId },
    }
  })
  const oldIds = new Set(old.map((p) => p.id))
  if (
    next.some(
      (p) =>
        !oldIds.has(p.id) &&
        (s.parts.some((o) => o.id === p.id) || s.components.some((o) => o.id === p.id)),
    )
  )
    return null
  const removed = [...oldIds].filter((id) => !next.some((p) => p.id === id))
  return {
    ...s,
    parts: [...s.parts.filter((p) => !oldIds.has(p.id)), ...next],
    joints: s.joints.filter((j) => !removed.some((id) => jointInvolves(j, id))),
  }
}
