import type { CarcaseComponent, Component, ComponentId, FaceFrameComponent, Part, Scene } from './types'
import { frontGeometryOf, orientedPanel, validateCarcaseParams } from './carcaseRoles'
import { faceFrameGeometry } from './faceFrame'
import { grainAxisOf, grainFieldFor } from './grain'
import { overridesOf, roleThicknessFor } from './resolveThickness'
import { reconcileBoards, type GeneratedBoard } from './reconcileBoards'

const LABEL: Record<string, string> = {
  'stile-left': 'Stile L',
  'stile-right': 'Stile R',
  'rail-top': 'Top rail',
  'rail-bottom': 'Bottom rail',
}

// The boards one cabinet's frame is, or null where the cabinet cannot be resolved at all — the
// caller then carries the frame through untouched rather than emptying it mid-keystroke. An empty
// list is different: the cabinet resolved, and stage 1 cannot frame it, so the frame declines.
function frameBoards(cabinet: CarcaseComponent, scene: Scene): GeneratedBoard[] | null {
  const p = cabinet.params
  const thicknessOf = roleThicknessFor(p, scene.materials, overridesOf(scene.parts, cabinet.id))
  // Safe to read thicknesses below only after this: the validator asks the frame material through
  // the same resolver and reports a missing one as a message rather than a throw.
  if (validateCarcaseParams(p, thicknessOf).length > 0) return null
  // The same rectangle every front on this cabinet is measured against, so a toe kick is recessed
  // behind the frame rather than covered by it.
  const g = faceFrameGeometry(p.section, frontGeometryOf(p).outer, p.frame)
  if (g === null) return []
  return g.members.map((m) => {
    const t = thicknessOf(m.role)
    // In front of the carcase, exactly where an overlay front sits today.
    const box = { x0: m.rect.x0, x1: m.rect.x1, y0: -t, y1: 0, z0: m.rect.z0, z1: m.rect.z1 }
    return {
      role: m.role,
      label: LABEL[m.role],
      panel: orientedPanel(box, 'y'),
      grain: grainFieldFor('y', grainAxisOf(m.role)),
      cuts: [],
    }
  })
}

// One frame per framed cabinet, as a component under it whose boards are the stiles and rails.
//
// Runs first among the generators because the frame reads nothing any of them emit: its inputs
// are the section tree, the cabinet's front rectangle, the frame parameters and the materials.
export function regenerateFaceFrames(scene: Scene): Scene {
  const carcases = scene.components.filter((c): c is CarcaseComponent => c.kind === 'carcase')
  if (carcases.length === 0) return scene

  // Keyed by cabinet: there is one frame per cabinet, where a drawer needs (cabinet, section).
  // Driven and detached alike — a detached frame satisfies its cabinet and is returned by
  // identity, rather than having a driven one built beside it.
  const existing = new Map<ComponentId | null, FaceFrameComponent>()
  for (const c of scene.components) if (c.kind === 'faceFrame') existing.set(c.parentId, c)

  const kept: FaceFrameComponent[] = []
  const claimed = new Set<FaceFrameComponent>()
  const wanted = new Map<FaceFrameComponent, { boards: GeneratedBoard[]; material: string }>()

  for (const cabinet of carcases) {
    if (cabinet.params.frame === undefined) continue
    const found = existing.get(cabinet.id)
    const boards = frameBoards(cabinet, scene)
    const frame: FaceFrameComponent = found ?? {
      kind: 'faceFrame',
      id: `cmp_${crypto.randomUUID()}`,
      label: 'Face frame',
      parentId: cabinet.id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      driven: true,
    }
    kept.push(frame)
    claimed.add(frame)
    if (boards !== null) wanted.set(frame, { boards, material: cabinet.params.frameMaterial })
  }

  let parts: Part[] = scene.parts
  for (const frame of kept) {
    // A detached frame is the user's, and so are its boards: skipping leaves them where they are.
    if (!frame.driven) continue
    const want = wanted.get(frame)
    // The cabinet did not resolve, so the frame and its boards are carried through as they were.
    if (want === undefined) continue
    parts = reconcileBoards(parts, frame, want.boards, want.material)
  }

  // A driven frame whose cabinet no longer asks for one is dropped, and so are its driven boards.
  // A board the user detached from it is theirs and stays — re-homed on the cabinet, because the
  // component it hung from is going. Dropping the component alone would leave its boards in the
  // scene naming a parent that no longer exists.
  for (const c of scene.components) {
    if (c.kind !== 'faceFrame' || claimed.has(c)) continue
    if (!c.driven) {
      kept.push(c)
      continue
    }
    // No board is built, so no material is read.
    parts = reconcileBoards(parts, c, [], '').map((p) =>
      p.parentId === c.id ? { ...p, parentId: c.parentId } : p,
    )
  }

  const others: Component[] = scene.components.filter((c) => c.kind !== 'faceFrame')
  const next: Component[] = [...others, ...kept]
  const unchanged =
    next.length === scene.components.length && next.every((c, i) => c === scene.components[i])
  const components = unchanged ? scene.components : next
  return components === scene.components && parts === scene.parts
    ? scene
    : { ...scene, components, parts }
}
