import { wallBindingError } from './installationRecipe'
import type { InstallationDraft, WallBinding, WallFillerDraft } from './installationRecipe'
import type { ProjectStructure } from './projectStructure'
import { roomComponentIds } from './projectStructure'
import { roomPoint } from './roomGeometry'
import type { Scene } from './types'
export const installationSignature = (scene: Scene, project: ProjectStructure) =>
  JSON.stringify([scene, project])
export function wallBinding(
  scene: Scene,
  project: ProjectStructure,
  draft: Pick<InstallationDraft, 'roomId' | 'wallId' | 'memberIds' | 'datumLevelId'>,
  checkPlacement = false,
): { binding: WallBinding | null; sourceIssue?: string } {
  const room = project.areas.flatMap((a) => a.rooms).find((r) => r.id === draft.roomId)
  if (!room?.geometry)
    return { binding: null, sourceIssue: 'The source room or its geometry is missing.' }
  const members = roomComponentIds(
    room.items.flatMap((i) => i.rootComponentIds),
    scene,
  )
  if (
    draft.memberIds.some(
      (id) =>
        !members.has(id) || !scene.components.some((c) => c.id === id && c.kind === 'carcase'),
    )
  )
    return { binding: null, sourceIssue: 'A cabinet is missing or no longer belongs to this room.' }
  const wall = room.geometry.walls.find((w) => w.id === draft.wallId)
  if (!wall) return { binding: null, sourceIssue: 'The source wall is missing.' }
  if (checkPlacement && room.geometry.placements.some((p) => draft.memberIds.includes(p.cabinetId)))
    return {
      binding: null,
      sourceIssue:
        'Detach existing wall placements in Room geometry before installing these cabinets.',
    }
  const level = draft.datumLevelId
    ? room.geometry.siteLevels?.find((l) => l.id === draft.datumLevelId)
    : undefined
  if (draft.datumLevelId && !level)
    return { binding: null, sourceIssue: 'The selected site datum is missing.' }
  const binding = {
    start: roomPoint(wall.start, room.geometry),
    end: roomPoint(wall.end, room.geometry),
    datum: level?.elevation.value ?? 0,
  }
  const error = wallBindingError(binding)
  return error ? { binding: null, sourceIssue: error } : { binding }
}
export const fillerBinding = (scene: Scene, project: ProjectStructure, d: WallFillerDraft) =>
  wallBinding(scene, project, { ...d, memberIds: [d.cabinetId], datumLevelId: '' })
export function refreshInstallationSources(scene: Scene, project: ProjectStructure): Scene {
  let changed = false
  const installations = scene.installations?.map((run) => {
    const resolved = wallBinding(scene, project, run.draft, true)
    if (
      JSON.stringify([run.binding, run.sourceIssue]) ===
      JSON.stringify([resolved.binding, resolved.sourceIssue])
    )
      return run
    changed = true
    return { ...run, ...resolved, sourceIssue: resolved.sourceIssue }
  })
  const parts = scene.parts.map((p) => {
    if (p.kind !== 'board' || !p.wallFiller) return p
    const resolved = fillerBinding(scene, project, p.wallFiller.draft)
    if (
      JSON.stringify([p.wallFiller.binding, p.wallFiller.sourceIssue]) ===
      JSON.stringify([resolved.binding, resolved.sourceIssue])
    )
      return p
    changed = true
    return { ...p, wallFiller: { ...p.wallFiller, ...resolved, sourceIssue: resolved.sourceIssue } }
  })
  return changed ? { ...scene, ...(installations ? { installations } : {}), parts } : scene
}
