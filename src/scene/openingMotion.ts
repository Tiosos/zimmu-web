import type { BoardPart, CarcaseComponent, Part, Scene } from './types'
import type { ProjectStructure } from './projectStructure'
import { roomComponentIds } from './projectStructure'
import { roomPoint } from './roomGeometry'
import { pullTargets } from './pullLayout'
import { frontTargets } from './frontsDrawers'
import { frontRoleOf } from './frontCells'
import { motionDrawer } from './motionHardware'
import { cabinetSpaceBox } from '../geom/assembly'
import {
  composeWorldMatrix,
  multiplyMatrix,
  resolveWorldMatrix,
  applyMatrixToPoint,
} from '../geom/transform'
import {
  openingMotionError,
  defaultOpeningMotion,
  type OpeningMotion,
  type OpeningSetting,
} from './openingMotionRecipe'
export interface MotionBox {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}
export interface OpeningTarget {
  id: string
  label: string
  cabinetId: string
  kind: OpeningSetting['kind']
  hinge?: 'left' | 'right'
  part: BoardPart
  partIds: string[]
  box: MotionBox
  maximumTravel: number
  nominal: number | null
  issue?: string
}
const mapOf = (s: Scene) => new Map(s.components.map((c) => [c.id, c]))
export const openingSignature = (scene: Scene, project: ProjectStructure) =>
  JSON.stringify([scene, project])
export function openingTargets(scene: Scene): OpeningTarget[] {
  const map = mapOf(scene)
  return scene.components.flatMap((c) => {
    if (c.kind !== 'carcase') return []
    let fronts
    try {
      fronts = pullTargets(scene, c.id)
    } catch {
      return []
    }
    return fronts.map((t) => {
      const b = cabinetSpaceBox(t.part, map, c),
        box = { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z }
      const world = resolveWorldMatrix(c, map)
      let issue = t.locked ? 'Detached front or drawer parts cannot be previewed.' : undefined
      if (Math.abs(world[2]) > 1e-6 || Math.abs(world[6]) > 1e-6 || Math.abs(world[10] - 1) > 1e-6)
        issue = 'Only upright cabinets are supported.'
      const target: OpeningTarget = {
        id: t.id,
        label: `${c.label}: ${t.label}`,
        cabinetId: c.id,
        kind: t.kind,
        hinge: t.hinge,
        part: t.part,
        partIds: [t.id],
        box,
        maximumTravel: 0,
        nominal: null,
        issue,
      }
      if (t.kind === 'door' && !t.hinge) target.issue = 'The door hinge side is unavailable.'
      if (t.kind === 'drawer-front') {
        const opening = frontTargets(scene, c.id).find((o) =>
          scene.parts.some(
            (p) => p.id === t.id && p.role === frontRoleOf({ ...o, leaf: t.leaf as 0 | 1 }),
          ),
        )
        const drawer = opening ? motionDrawer(scene, c.id, opening) : undefined
        const parts = drawer
          ? scene.parts.filter(
              (p): p is BoardPart => p.kind === 'board' && p.parentId === drawer.id,
            )
          : []
        if (!drawer?.driven || parts.length !== 5 || parts.some((p) => !p.driven))
          target.issue = 'A complete driven drawer box is required.'
        if (parts.length) {
          const boxes = parts.map((p) => cabinetSpaceBox(p, map, c))
          target.maximumTravel = Math.min(
            3000,
            Math.max(...boxes.map((b) => b.max.y)) - Math.min(...boxes.map((b) => b.min.y)),
          )
          target.nominal = drawer?.params.nominal ?? target.maximumTravel
          target.partIds.push(...parts.map((p) => p.id))
        }
      }
      return target
    })
  })
}
export function defaultOpeningSetting(target: OpeningTarget): OpeningSetting {
  return {
    frontId: target.id,
    kind: target.kind,
    limit: target.kind === 'door' ? 90 : target.maximumTravel,
    axisOffset: 0,
  }
}
export function openingSettingIssue(t: OpeningTarget, setting: OpeningSetting): string | null {
  if (t.issue) return t.issue
  if (setting.kind !== t.kind) return 'The front kind has changed; reload its settings.'
  if (t.kind === 'drawer-front' && setting.limit > t.maximumTravel + 1e-6)
    return 'Drawer travel exceeds the available box/runner length.'
  return null
}
const translate = (x: number, y: number, z = 0) =>
  composeWorldMatrix({ position: { x, y, z }, rotation: { x: 0, y: 0, z: 0 } })
export function targetMotion(
  t: OpeningTarget,
  setting: OpeningSetting,
  fraction: number,
): Float64Array {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
    throw Error('Opening fraction must be between zero and one.')
  if (t.kind === 'drawer-front') return translate(0, -setting.limit * fraction)
  const x = t.hinge === 'left' ? t.box.x0 : t.box.x1,
    y = t.box.y1 + setting.axisOffset
  const rotation = composeWorldMatrix({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: (t.hinge === 'left' ? -1 : 1) * setting.limit * fraction },
  })
  return multiplyMatrix(multiplyMatrix(translate(x, y), rotation), translate(-x, -y))
}
export function openingMatrices(
  scene: Scene,
  settings: OpeningMotion,
  fractions: Record<string, number>,
): Map<string, Float64Array> {
  const error = openingMotionError(settings)
  if (error) throw Error(error)
  const targets = openingTargets(scene),
    map = mapOf(scene),
    result = new Map<string, Float64Array>()
  for (const [id, fraction] of Object.entries(fractions)) {
    const t = targets.find((t) => t.id === id)
    if (!t) throw Error('A selected front is missing.')
    const setting = settings.entries.find((e) => e.frontId === id) ?? defaultOpeningSetting(t)
    const issue = openingSettingIssue(t, setting)
    if (issue) throw Error(issue)
    const c = scene.components.find((c) => c.id === t.cabinetId) as CarcaseComponent
    const cabinetMatrix = resolveWorldMatrix(c, map),
      motion = targetMotion(t, setting, fraction)
    for (const part of scene.parts.filter((p) => t.partIds.includes(p.id))) {
      // Recover the part in cabinet space without introducing Euler decomposition.
      const pm = resolveWorldMatrix(part, map),
        inv = inverseRigid(cabinetMatrix)
      result.set(
        part.id,
        multiplyMatrix(multiplyMatrix(cabinetMatrix, motion), multiplyMatrix(inv, pm)),
      )
    }
  }
  return result
}
function inverseRigid(m: Float64Array): Float64Array {
  const r = translate(0, 0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 4 + j] = m[j * 4 + i]
  for (let i = 0; i < 3; i++) r[12 + i] = -(r[i] * m[12] + r[4 + i] * m[13] + r[8 + i] * m[14])
  return r
}
export function motionPartBox(part: Part, matrix: Float64Array): MotionBox {
  const xs = part.kind === 'board' ? [0, part.length] : [-part.diameter / 2, part.diameter / 2],
    ys = part.kind === 'board' ? [0, part.width] : xs,
    zs = [0, part.kind === 'board' ? part.thickness : part.length]
  const points = xs.flatMap((x) =>
    ys.flatMap((y) => zs.map((z) => applyMatrixToPoint(matrix, x, y, z))),
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
function canonicalSettings(settings: OpeningMotion): OpeningMotion {
  return {
    ...structuredClone(settings),
    entries: structuredClone(settings.entries).sort((a, b) =>
      a.frontId < b.frontId ? -1 : a.frontId > b.frontId ? 1 : 0,
    ),
  }
}
export interface OpeningPreview {
  signature: string
  settings: OpeningMotion
  errors: string[]
  changed: boolean
}
export function previewOpeningSettings(
  scene: Scene,
  project: ProjectStructure,
  settings: OpeningMotion,
): OpeningPreview {
  const errors: string[] = [],
    error = openingMotionError(settings)
  if (error) errors.push(error)
  else {
    const targets = openingTargets(scene)
    for (const e of settings.entries) {
      const t = targets.find((t) => t.id === e.frontId)
      // Unchanged broken references remain saved for repair; new/edited ones need a live target.
      const prior = scene.openingMotion?.entries.find((p) => p.frontId === e.frontId)
      if (!t) {
        if (JSON.stringify(prior) !== JSON.stringify(e))
          errors.push(`Front ${e.frontId} is missing.`)
      } else {
        const issue = openingSettingIssue(t, e)
        if (issue && JSON.stringify(prior) !== JSON.stringify(e))
          errors.push(`${t.label}: ${issue}`)
      }
    }
  }
  return {
    signature: openingSignature(scene, project),
    settings: errors.length ? structuredClone(settings) : canonicalSettings(settings),
    errors,
    changed:
      !errors.length &&
      JSON.stringify(canonicalSettings(scene.openingMotion ?? defaultOpeningMotion())) !==
        JSON.stringify(canonicalSettings(settings)),
  }
}
export function acceptOpeningSettings(
  scene: Scene,
  project: ProjectStructure,
  preview: OpeningPreview,
): Scene | null {
  if (preview.signature !== openingSignature(scene, project)) return null
  const checked = previewOpeningSettings(scene, project, preview.settings)
  if (!checked.changed) return null
  return { ...scene, openingMotion: structuredClone(checked.settings) }
}
export interface MotionFinding {
  frontId: string
  otherId: string
  otherLabel: string
  at: number
  message: string
}
const union = (a: MotionBox, b: MotionBox): MotionBox => ({
  x0: Math.min(a.x0, b.x0),
  x1: Math.max(a.x1, b.x1),
  y0: Math.min(a.y0, b.y0),
  y1: Math.max(a.y1, b.y1),
  z0: Math.min(a.z0, b.z0),
  z1: Math.max(a.z1, b.z1),
})
const expand = (b: MotionBox, n: number): MotionBox => ({
  x0: b.x0 - n,
  x1: b.x1 + n,
  y0: b.y0 - n,
  y1: b.y1 + n,
  z0: b.z0 - n,
  z1: b.z1 + n,
})
const overlaps = (a: MotionBox, b: MotionBox) =>
  a.x0 < b.x1 - 1e-6 &&
  a.x1 > b.x0 + 1e-6 &&
  a.y0 < b.y1 - 1e-6 &&
  a.y1 > b.y0 + 1e-6 &&
  a.z0 < b.z1 - 1e-6 &&
  a.z1 > b.z0 + 1e-6
export function checkOpeningPaths(
  scene: Scene,
  project: ProjectStructure,
  settings: OpeningMotion,
  ids: string[],
): { findings: MotionFinding[]; errors: string[]; steps: number; truncated: boolean } {
  const result = {
    findings: [] as MotionFinding[],
    errors: [] as string[],
    steps: 0,
    truncated: false,
  }
  try {
    const error = openingMotionError(settings)
    if (error) throw Error(error)
    if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length)
      throw Error('Select 1–50 distinct moving fronts for a path check.')
    const targets = openingTargets(scene),
      chosen = ids.map((id) => {
        const t = targets.find((t) => t.id === id)
        if (!t) throw Error('A selected front is missing.')
        return t
      })
    const entries = chosen.map(
      (t) => settings.entries.find((e) => e.frontId === t.id) ?? defaultOpeningSetting(t),
    )
    entries.forEach((e, i) => {
      const issue = openingSettingIssue(chosen[i], e)
      if (issue) throw Error(issue)
    })
    const steps = Math.max(...entries.map((e) => Math.ceil(e.limit / (e.kind === 'door' ? 2 : 10))))
    result.steps = steps
    const moving = new Set(chosen.flatMap((t) => t.partIds)),
      map = mapOf(scene)
    const fixed = scene.parts
      .filter((p) => !moving.has(p.id))
      .map((p) => ({
        id: p.id,
        label: p.label,
        box: motionPartBox(p, resolveWorldMatrix(p, map)),
        cabinetIds: null as string[] | null,
      }))
    for (const room of project.areas.flatMap((a) => a.rooms)) {
      if (!room.geometry) continue
      const g = room.geometry,
        members = roomComponentIds(
          room.items.flatMap((i) => i.rootComponentIds),
          scene,
        ),
        cabinetIds = [...members]
      for (const w of g.walls) {
        const a = roomPoint(w.start, g),
          b = roomPoint(w.end, g)
        fixed.push({
          id: `wall:${room.id}:${w.id}`,
          label: w.name,
          box: {
            x0: Math.min(a.x, b.x) - 0.01,
            x1: Math.max(a.x, b.x) + 0.01,
            y0: Math.min(a.y, b.y) - 0.01,
            y1: Math.max(a.y, b.y) + 0.01,
            z0: -1000000,
            z1: 1000000,
          },
          cabinetIds,
        })
      }
      for (const o of g.obstacles) {
        const points = [0, o.width].flatMap((x) =>
          [0, o.depth].map((y) => roomPoint({ x: o.position.x + x, y: o.position.y + y }, g)),
        )
        fixed.push({
          id: `obstacle:${room.id}:${o.id}`,
          label: o.name,
          box: {
            x0: Math.min(...points.map((p) => p.x)),
            x1: Math.max(...points.map((p) => p.x)),
            y0: Math.min(...points.map((p) => p.y)),
            y1: Math.max(...points.map((p) => p.y)),
            z0: 0,
            z1: o.height,
          },
          cabinetIds,
        })
      }
    }
    const seen = new Set<string>(),
      partById = new Map(scene.parts.map((p) => [p.id, p]))
    const boxes = (fraction: number) => {
      const matrices = openingMatrices(
        scene,
        settings,
        Object.fromEntries(ids.map((id) => [id, fraction])),
      )
      return chosen.map((t) =>
        t.partIds.map((id) => {
          const part = partById.get(id)!,
            matrix = matrices.get(id)!
          let box = motionPartBox(part, matrix)
          if (id === t.id && t.part.frontPull && settings.pullProjection) {
            const c = scene.components.find((c) => c.id === t.cabinetId)!,
              cm = resolveWorldMatrix(c, map),
              motion = targetMotion(t, entries[chosen.indexOf(t)], fraction)
            const local = { ...t.box, y0: t.box.y0 - settings.pullProjection }
            const points = [local.x0, local.x1].flatMap((x) =>
              [local.y0, local.y1].flatMap((y) =>
                [local.z0, local.z1].map((z) =>
                  applyMatrixToPoint(multiplyMatrix(cm, motion), x, y, z),
                ),
              ),
            )
            box = {
              x0: Math.min(...points.map((p) => p[0])),
              x1: Math.max(...points.map((p) => p[0])),
              y0: Math.min(...points.map((p) => p[1])),
              y1: Math.max(...points.map((p) => p[1])),
              z0: Math.min(...points.map((p) => p[2])),
              z1: Math.max(...points.map((p) => p[2])),
            }
          }
          return { id, box }
        }),
      )
    }
    let prior = boxes(0)
    for (let step = 1; step <= steps; step++) {
      const current = boxes(step / steps)
      const swept = current.map((parts, i) =>
        parts.map((p, j) => {
          const t = chosen[i],
            e = entries[i],
            radius = Math.hypot(
              t.box.x1 - t.box.x0,
              Math.abs(t.box.y0 - t.box.y1) + Math.abs(e.axisOffset) + settings.pullProjection,
            )
          const arc =
            e.kind === 'door' ? radius * (1 - Math.cos((e.limit * Math.PI) / 180 / steps / 2)) : 0
          return { id: p.id, box: expand(union(p.box, prior[i][j].box), arc) }
        }),
      )
      for (let i = 0; i < chosen.length; i++) {
        const t = chosen[i]
        const others = [
          ...fixed.filter((f) => f.cabinetIds === null || f.cabinetIds.includes(t.cabinetId)),
          ...swept.flatMap((parts, j) =>
            j === i ? [] : parts.map((p) => ({ id: p.id, label: chosen[j].label, box: p.box })),
          ),
        ]
        for (const other of others) {
          const key = `${t.id}|${other.id}`
          if (
            seen.has(key) ||
            !swept[i].some((p) => overlaps(expand(p.box, settings.clearance), other.box))
          )
            continue
          seen.add(key)
          result.findings.push({
            frontId: t.id,
            otherId: other.id,
            otherLabel: other.label,
            at: step / steps,
            message: `${t.label} may interfere with ${other.label} by ${((step / steps) * 100).toFixed(0)}% opening.`,
          })
          if (result.findings.length >= 200) {
            result.truncated = true
            return result
          }
        }
      }
      prior = current
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e))
  }
  return result
}
