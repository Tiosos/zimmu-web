import type { CarcaseComponent, Component, ComponentId, FaceFrameComponent, Part, Scene } from './types'
import { frontGeometryOf, openingRect, orientedPanel, sectionThickness, validateCarcaseParams } from './carcaseRoles'
import { faceFrameGeometry, frameOverlay, hingedFrameMember } from './faceFrame'
import { frontCells, frontRoleOf } from './frontCells'
import { cupRow } from './frontMachining'
import { blumFaceFrameHingeFor } from './faceFrameHardware'
import { grainAxisOf, grainFieldFor } from './grain'
import { overridesOf, roleThicknessFor } from './resolveThickness'
import { reconcileBoards, type GeneratedBoard } from './reconcileBoards'
import { resolveSections } from './sectionTree'

const LABEL: Record<string, string> = {
  'stile-left': 'Stile L',
  'stile-right': 'Stile R',
  'rail-top': 'Top rail',
  'rail-bottom': 'Bottom rail',
}

// The boards one cabinet's frame is, or null where the cabinet cannot be resolved at all — the
// caller then carries the frame through untouched rather than emptying it mid-keystroke. An empty
// list is different: the cabinet resolved, but this configuration has no buildable frame, so it declines.
function frameBoards(cabinet: CarcaseComponent, scene: Scene): GeneratedBoard[] | null {
  const p = cabinet.params
  const thicknessOf = roleThicknessFor(p, scene.materials, overridesOf(scene.parts, cabinet.id))
  // Safe to read thicknesses below only after this: the validator asks the frame material through
  // the same resolver and reports a missing one as a message rather than a throw.
  if (validateCarcaseParams(p, thicknessOf).length > 0) return null
  // The same rectangle every front on this cabinet is measured against, so a toe kick is recessed
  // behind the frame rather than covered by it.
  const tree = resolveSections(
    p.section,
    openingRect(p, thicknessOf),
    sectionThickness(thicknessOf),
  )
  const fronts = frontGeometryOf(p, tree)
  const g = faceFrameGeometry(p.section, fronts.outer, p.frame, tree)
  if (g === null) return []

  // Mounting cuts keyed by the stile geometry chose. They are frame-owned: reconcileBoards tags
  // them with the FaceFrameComponent, while door cups remain carcase-owned.
  const cutsByRole = new Map<string, GeneratedBoard['cuts']>()
  const operationsByRole = new Map<string, NonNullable<GeneratedBoard['operations']>>()
  for (const cell of frontCells(p.section, tree, fronts)) {
    if (cell.spec.kind !== 'door' || cell.hinge === undefined) continue
    const member = hingedFrameMember(g, cell.sectionId, cell.hinge, cell.openingId)
    if (member === null) continue
    const overlay = frameOverlay(member, cell.rect, cell.hinge, p.frontMount)
    const hardware = blumFaceFrameHingeFor(p.frontMount, overlay)
    if (hardware === null) continue

    const frontRole = frontRoleOf(cell)
    const cup = cupRow(
      {
        length: cell.rect.z1 - cell.rect.z0,
        width: cell.rect.x1 - cell.rect.x0,
        thickness: thicknessOf(frontRole),
      },
      cell.hinge,
      frontRole,
      hardware.cupDepth,
    )
    if (cup === null) continue

    const memberWidth = member.rect.x1 - member.rect.x0
    const memberDepth = thicknessOf(member.role)
    const localCenters = Array.from(
      { length: cup.count },
      (_, i) => cell.rect.z0 + cup.start.x + cup.pitch * i - member.rect.z0,
    )

    if (hardware.plate.kind === 'inset-adapter') {
      // Preserve the discriminated-union narrowing across the callback boundary. TypeScript does
      // not assume a mutable property access stays narrowed inside a closure.
      const plate = hardware.plate
      const own = operationsByRole.get(member.role) ?? []
      localCenters.forEach((center, i) => {
        own.push({
          kind: 'manual-machining',
          id: `frame_manual_${frontRole}_${i}`,
          label: `Blum inset adapter ${i + 1}`,
          hardwareKey: hardware.key,
          face: '-Z',
          at: {
            x: center,
            y: cell.hinge === 'left' ? memberWidth - plate.frontOffset : plate.frontOffset,
            z: 0,
          },
          diameter: plate.pilotDiameter,
          pitch: plate.pitch,
          count: 2,
          angle: plate.angle,
          edgeOffset: plate.frontOffset,
          template: 'Blum PLATEMATE',
          instruction:
            'Fit 175H5030.21 with PLATEMATE/template; drill two Ø3 pilots at 32 mm spacing using the documented 12° installation geometry.',
        })
      })
      operationsByRole.set(member.role, own)
      continue
    }

    const own = cutsByRole.get(member.role) ?? []
    localCenters.forEach((center, i) => {
      if (hardware.plate.kind === 'face-mount') {
        const fromInner = hardware.plate.innerEdgeOffset
        own.push({
          kind: 'hole-array',
          id: `frame_plate_${frontRole}_${i}`,
          label: `Blum 38B plate ${i + 1}`,
          face: '-Z',
          axis: 'U',
          start: {
            x: center - hardware.plate.pitch / 2,
            y: cell.hinge === 'left' ? memberWidth - fromInner : fromInner,
            z: 0,
          },
          pitch: hardware.plate.pitch,
          count: 2,
          diameter: hardware.plate.pilotDiameter,
          depth: Math.min(12, (memberDepth * 2) / 3),
        })
      } else {
        // 38N/39C wrap around the frame and take one cabinet pilot through the inner edge,
        // centred through a nominal 19 mm frame depth in Blum's pattern. Using this board's actual
        // depth preserves that centre when the frame material is overridden.
        const face = cell.hinge === 'left' ? '+Y' : '-Y'
        own.push({
          kind: 'hole-array',
          id: `frame_plate_${frontRole}_${i}`,
          label: `Blum ${hardware.family} plate ${i + 1}`,
          face,
          axis: 'U',
          start: {
            x: center,
            y: face === '+Y' ? memberWidth : 0,
            z: memberDepth / 2,
          },
          pitch: 1,
          count: 1,
          diameter: hardware.plate.pilotDiameter,
          depth: Math.min(12, (memberWidth * 2) / 3),
        })
      }
    })
    cutsByRole.set(member.role, own)
  }

  let midStiles = 0
  let midRails = 0
  return g.members.map((m) => {
    const t = thicknessOf(m.role)
    const label =
      LABEL[m.role] ??
      (m.role.startsWith('stile-')
        ? `Mid stile ${++midStiles}`
        : m.role.startsWith('rail-')
          ? `Mid rail ${++midRails}`
          : m.role)
    // In front of the carcase, exactly where an overlay front sits today.
    const box = { x0: m.rect.x0, x1: m.rect.x1, y0: -t, y1: 0, z0: m.rect.z0, z1: m.rect.z1 }
    return {
      role: m.role,
      label,
      panel: orientedPanel(box, 'y'),
      grain: grainFieldFor('y', grainAxisOf(m.role)),
      cuts: cutsByRole.get(m.role) ?? [],
      operations: operationsByRole.get(m.role) ?? [],
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
