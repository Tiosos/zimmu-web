import { Euler, Vector3 } from 'three'
import type { CabinetSheetInput, Point2D } from './drawing'
import {
  adjustableShelfAccessResults,
  type AdjustableShelfAccessResult,
} from '../scene/carcaseParts'
import { overridesOf, roleThicknessFor } from '../scene/resolveThickness'
import type { ShelfPose } from '../scene/interiorAccess'
import type { LocalBox } from '../scene/carcaseLayout'

export interface InstallationLine {
  a: Point2D
  b: Point2D
  role: 'structure' | 'shelf' | 'entry'
}
export interface InstallationText extends Point2D {
  text: string
  size: number
}
export interface InstallationSheet {
  kind: 'installation'
  cabinetLabel: string
  cabinetId: string
  shelfRole: string
  shelfLabel: string
  date: string
  status: 'straight' | 'rotated' | 'unverified'
  // Exact indices into the witnessed path; no synthetic maneuver is substituted.
  poseIndices: number[]
  lines: InstallationLine[]
  texts: InstallationText[]
}

const edges = [
  [0, 1],
  [0, 2],
  [0, 4],
  [1, 3],
  [1, 5],
  [2, 3],
  [2, 6],
  [3, 7],
  [4, 5],
  [4, 6],
  [5, 7],
  [6, 7],
]
const project = (p: Vector3): Point2D => ({
  x: (p.x + p.y) / Math.sqrt(2),
  y: (p.x - p.y) / Math.sqrt(6) - p.z * Math.sqrt(2 / 3),
})

export function installationCorners(box: LocalBox, pose?: ShelfPose): Point2D[] {
  const centre = new Vector3((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2)
  const rotation = pose
    ? new Euler(
        (pose.rotation.x * Math.PI) / 180,
        (pose.rotation.y * Math.PI) / 180,
        (pose.rotation.z * Math.PI) / 180,
        'ZYX',
      )
    : null
  return Array.from({ length: 8 }, (_, i) => {
    const p = new Vector3(i & 1 ? box.x1 : box.x0, i & 2 ? box.y1 : box.y0, i & 4 ? box.z1 : box.z0)
    if (pose && rotation)
      p.sub(centre)
        .applyEuler(rotation)
        .add(new Vector3(pose.center.x, pose.center.y, pose.center.z))
    return project(p)
  })
}

export function installationPoseIndices(result: AdjustableShelfAccessResult): number[] {
  const poses = result.path?.poses
  if (!poses?.length) return []
  const last = poses.length - 1
  const frontY = Math.min(0, ...result.obstacles.map((o) => o.box.y0)) / 2
  let entry = 0
  for (let i = 1; i <= last; i++) {
    if (Math.abs(poses[i].center.y - frontY) < Math.abs(poses[entry].center.y - frontY)) entry = i
  }
  const turning = poses.flatMap((p, i) => {
    const next = poses[i + 1]
    return next &&
      (['x', 'y', 'z'] as const).some(
        (axis) => Math.abs(p.rotation[axis] - next.rotation[axis]) > 1e-7,
      )
      ? [i]
      : []
  })
  const turn = turning.length ? turning[Math.floor(turning.length / 2)] : null
  return [...new Set([0, entry, ...(turn === null ? [] : [turn]), last])].sort((a, b) => a - b)
}

function buildSheet(
  input: CabinetSheetInput,
  result: AdjustableShelfAccessResult,
  date: string,
): InstallationSheet {
  const part = input.parts.find((p) => p.parentId === input.cabinet.id && p.role === result.role)
  const shelfLabel = part?.label ?? `Requested shelf ${Number(result.role.split('-').at(-1)) + 1}`
  const indices = installationPoseIndices(result)
  const sheet: InstallationSheet = {
    kind: 'installation',
    cabinetLabel: input.cabinet.label,
    cabinetId: input.cabinet.id,
    shelfRole: result.role,
    shelfLabel,
    date,
    status: result.path?.kind ?? 'unverified',
    poseIndices: indices,
    lines: [],
    texts: [],
  }
  // Text is laid out once in page millimetres for every consumer. Cap the font size by the
  // available width, including long user labels and imported identities; never silently truncate.
  const text = (x: number, y: number, value: string, size = 3, width = 267) => {
    const safe = value.replace(/[\r\n\t]+/g, ' ')
    sheet.texts.push({
      x,
      y,
      text: safe,
      size: Math.min(size, width / Math.max(1, safe.length * 0.65)),
    })
  }
  text(148.5, 18, 'SHELF INSTALLATION', 5)
  text(148.5, 26, `${input.cabinet.label} / ${shelfLabel}`, 3.5)
  text(148.5, 32, `Cabinet ${input.cabinet.id} / ${result.role}`, 2.5)
  const box = result.shelfBox
  text(
    148.5,
    38,
    `Width ${(box.x1 - box.x0).toFixed(1)} x depth ${(box.y1 - box.y0).toFixed(1)} x thickness ${(box.z1 - box.z0).toFixed(1)} mm`,
  )
  const entryIndex = result.apertures.findIndex((a) => a.id === result.path?.apertureId)
  text(
    148.5,
    45,
    result.path
      ? `${result.path.kind === 'straight' ? 'Straight' : 'Angled'} insertion / Entry opening ${entryIndex + 1} of ${result.apertures.length}`
      : 'NO VERIFIED ROUTE FOUND - DO NOT MANUFACTURE THIS REQUESTED SHELF',
    3.2,
  )

  const structure = result.obstacles.map((o) => installationCorners(o.box))
  const views = indices.length
    ? indices.map((index) => installationCorners(box, result.path!.poses[index]))
    : [installationCorners(box)]
  const all = [...structure.flat(), ...views.flat()]
  const x0 = Math.min(...all.map((p) => p.x)),
    x1 = Math.max(...all.map((p) => p.x))
  const y0 = Math.min(...all.map((p) => p.y)),
    y1 = Math.max(...all.map((p) => p.y))
  const scale = Math.min(120 / Math.max(1, x1 - x0), 43 / Math.max(1, y1 - y0))
  views.forEach((shelf, i) => {
    const left = 15 + (i % 2) * 138,
      top = 51 + Math.floor(i / 2) * 60
    const place = (p: Point2D): Point2D => ({
      x: left + 60 + (p.x - (x0 + x1) / 2) * scale,
      y: top + 7 + (p.y - y0) * scale,
    })
    const wire = (points: Point2D[], role: InstallationLine['role']) => {
      edges.forEach(([a, b]) =>
        sheet.lines.push({ a: place(points[a]), b: place(points[b]), role }),
      )
    }
    structure.forEach((points) => wire(points, 'structure'))
    wire(shelf, 'shelf')
    const aperture = result.apertures[entryIndex]
    if (aperture) {
      const r = aperture.rect,
        y = Math.min(0, ...result.obstacles.map((o) => o.box.y0))
      const corners = [
        [r.x0, r.z0],
        [r.x1, r.z0],
        [r.x1, r.z1],
        [r.x0, r.z1],
      ].map(([x, z]) => place(project(new Vector3(x, y, z))))
      corners.forEach((a, j) => sheet.lines.push({ a, b: corners[(j + 1) % 4], role: 'entry' }))
    }
    const caption = !result.path
      ? 'Intended position only - no installation path'
      : i === 0
        ? 'Align outside'
        : i === views.length - 1
          ? 'Installed position'
          : i === 1
            ? 'Pass through opening'
            : 'Reorient inside'
    text(left + 60, top + 2, `${i + 1}. ${caption}`, 3, 125)
    const pose = result.path?.poses[indices[i]]
    if (pose)
      text(
        left + 60,
        top + 55,
        `Tilt X ${pose.rotation.x.toFixed(1)} / Y ${pose.rotation.y.toFixed(1)} / Turn Z ${pose.rotation.z.toFixed(1)} deg`,
        2.5,
        125,
      )
  })
  text(
    148.5,
    176,
    'Isometric snapshots - not to scale. Dark: shelf / grey: structure / dashed: entry opening.',
    2.7,
  )
  text(
    148.5,
    182,
    result.path
      ? 'Selected verified poses only. Follow the full motion in the 3D insertion preview, not direct moves between pictures.'
      : 'No route was verified by the bounded search; this does not prove every possible physical maneuver impossible.',
    2.7,
  )
  text(
    148.5,
    188,
    'Doors/fronts assumed open or removed. Hardware and other removable shelves excluded from collision checks.',
    2.7,
  )
  text(
    148.5,
    195,
    `Regenerate after design changes. Cabinet-local X: width, Y: depth, Z: height. Date: ${date}`,
    2.7,
  )
  return sheet
}

export function buildShelfInstallationSheets(
  input: CabinetSheetInput,
  date: string,
): InstallationSheet[] {
  const thickness = roleThicknessFor(
    input.cabinet.params,
    input.materials,
    overridesOf(input.parts, input.cabinet.id),
  )
  return adjustableShelfAccessResults(input.cabinet.params, thickness).map((result) =>
    buildSheet(input, result, date),
  )
}
