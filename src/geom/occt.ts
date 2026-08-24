import type { OpenCascadeInstance, TopoDS_Shape } from 'opencascade.js'
import type { CutDef, DowelCut, Face, HoleArrayCut, MitreCut, Vec3 } from '../scene/types'
import { computeMitreTool } from './mitre'
import {
  computeEndTool,
  computeNotchTool,
  computeAxialBoreTool,
  computeTransverseBoreTool,
  type BoxToolDescriptor,
  type CylinderToolDescriptor,
} from './dowelCut'

// Single OCCT instance per page load. Initialization downloads and instantiates
// a ~65MB WASM module, so it must only happen once.
let ocPromise: Promise<OpenCascadeInstance> | null = null

export async function initOCCT(): Promise<OpenCascadeInstance> {
  if (ocPromise === null) {
    // Dynamic import keeps the WASM out of the entry bundle so first paint
    // doesn't wait on 65MB of geometry kernel.
    ocPromise = import('opencascade.js').then((mod) => mod.initOpenCascade())
  }
  return ocPromise
}

export function makeBox(oc: OpenCascadeInstance, dx: number, dy: number, dz: number): TopoDS_Shape {
  const builder = new oc.BRepPrimAPI_MakeBox_1(dx, dy, dz)
  const shape = builder.Shape()
  builder.delete()
  return shape
}

export function makeCylinder(
  oc: OpenCascadeInstance,
  radius: number,
  height: number,
): TopoDS_Shape {
  // BRepPrimAPI_MakeCylinder_1(R, H): default axis +Z, base circle centered at
  // origin. The _2 overload is (R, H, Angle) — 3 args — and throws at runtime if
  // called with 2 (confirmed against opencascade.js v1.1.1, 2026-06-27).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = new (oc as any).BRepPrimAPI_MakeCylinder_1(radius, height)
  const shape = builder.Shape()
  builder.delete()
  return shape
}

export function makeCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  position: Vec3,
  size: Vec3,
): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = new (oc as any).BRepPrimAPI_MakeBox_1(size.x, size.y, size.z)
  const toolShape = builder.Shape()
  builder.delete()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trsf = new (oc as any).gp_Trsf_1()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vec = new (oc as any).gp_Vec_4(position.x, position.y, position.z)
  trsf.SetTranslation_1(vec)
  vec.delete()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xform = new (oc as any).BRepBuilderAPI_Transform_2(toolShape, trsf, false)
  trsf.delete()
  const movedTool = xform.Shape()

  // BRepAlgoAPI_Cut_3(S1, S2) runs the boolean in its constructor (IsDone/Shape are
  // valid immediately). The progress-range overloads are unusable: Message_ProgressRange
  // is absent in opencascade.js v1.1.1 (see 2026-06-05-3d-export-notes.md).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const op = new (oc as any).BRepAlgoAPI_Cut_3(shape, movedTool)

  if (!op.IsDone()) {
    console.warn('makeCut: BRepAlgoAPI_Cut did not complete — returning input shape')
    op.delete()
    xform.delete()
    movedTool.delete()
    toolShape.delete()
    return shape
  }

  const result = op.Shape()
  op.delete()
  xform.delete()
  movedTool.delete()
  toolShape.delete()

  return result
}

// Subtract an angled half-space (oversized rotated box) to bevel one end of the
// board. The cutting tool geometry is derived by the pure computeMitreTool so the
// math is unit-tested; only the OCCT plumbing lives here (browser-only).
export function makeMitreCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  board: { length: number; width: number; thickness: number },
  mitre: MitreCut,
): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  const tool = computeMitreTool(board, mitre)

  const builder = new O.BRepPrimAPI_MakeBox_1(tool.boxSize.x, tool.boxSize.y, tool.boxSize.z)
  const boxShape = builder.Shape()
  builder.delete()

  // Translate the box to its pre-rotation origin.
  const tTrsf = new O.gp_Trsf_1()
  const tVec = new O.gp_Vec_4(tool.boxOrigin.x, tool.boxOrigin.y, tool.boxOrigin.z)
  tTrsf.SetTranslation_1(tVec)
  tVec.delete()
  const tXform = new O.BRepBuilderAPI_Transform_2(boxShape, tTrsf, false)
  tTrsf.delete()
  const translated = tXform.Shape()

  // Rotate about the pivot edge to tilt the inner face into the board.
  const rTrsf = new O.gp_Trsf_1()
  const pnt = new O.gp_Pnt_3(tool.pivot.x, tool.pivot.y, tool.pivot.z)
  const dir = new O.gp_Dir_4(tool.axisDir.x, tool.axisDir.y, tool.axisDir.z)
  const ax1 = new O.gp_Ax1_2(pnt, dir)
  rTrsf.SetRotation_1(ax1, tool.angleRad)
  pnt.delete()
  dir.delete()
  ax1.delete()
  const rXform = new O.BRepBuilderAPI_Transform_2(translated, rTrsf, false)
  rTrsf.delete()
  const movedTool = rXform.Shape()

  // BRepAlgoAPI_Cut_3(S1, S2) runs the boolean in its constructor; Message_ProgressRange
  // is absent in opencascade.js v1.1.1, so the progress-range overloads are unusable.
  const op = new O.BRepAlgoAPI_Cut_3(shape, movedTool)

  const cleanup = () => {
    op.delete()
    rXform.delete()
    movedTool.delete()
    tXform.delete()
    translated.delete()
    boxShape.delete()
  }

  if (!op.IsDone()) {
    console.warn('makeMitreCut: BRepAlgoAPI_Cut did not complete — returning input shape')
    cleanup()
    return shape
  }

  const result = op.Shape()
  cleanup()
  return result
}

// Rotate + translate an oversized box and subtract it. Generalizes makeMitreCut's
// body; serves dowel end cuts and notches. makeMitreCut is left as-is for boards.
export function makeBoxCutAt(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  tool: BoxToolDescriptor,
): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  const builder = new O.BRepPrimAPI_MakeBox_1(tool.boxSize.x, tool.boxSize.y, tool.boxSize.z)
  const boxShape = builder.Shape()
  builder.delete()

  const tTrsf = new O.gp_Trsf_1()
  const tVec = new O.gp_Vec_4(tool.boxOrigin.x, tool.boxOrigin.y, tool.boxOrigin.z)
  tTrsf.SetTranslation_1(tVec)
  tVec.delete()
  const tXform = new O.BRepBuilderAPI_Transform_2(boxShape, tTrsf, false)
  tTrsf.delete()
  const translated = tXform.Shape()

  const rTrsf = new O.gp_Trsf_1()
  const pnt = new O.gp_Pnt_3(tool.pivot.x, tool.pivot.y, tool.pivot.z)
  const dir = new O.gp_Dir_4(tool.axisDir.x, tool.axisDir.y, tool.axisDir.z)
  const ax1 = new O.gp_Ax1_2(pnt, dir)
  rTrsf.SetRotation_1(ax1, tool.angleRad)
  pnt.delete()
  dir.delete()
  ax1.delete()
  const rXform = new O.BRepBuilderAPI_Transform_2(translated, rTrsf, false)
  rTrsf.delete()
  const movedTool = rXform.Shape()

  // BRepAlgoAPI_Cut_3(S1, S2) runs the boolean in its constructor; Message_ProgressRange
  // is absent in opencascade.js v1.1.1, so the progress-range overloads are unusable.
  const op = new O.BRepAlgoAPI_Cut_3(shape, movedTool)

  const cleanup = () => {
    op.delete()
    rXform.delete()
    movedTool.delete()
    tXform.delete()
    translated.delete()
    boxShape.delete()
  }

  if (!op.IsDone()) {
    console.warn('makeBoxCutAt: BRepAlgoAPI_Cut did not complete — returning input shape')
    cleanup()
    return shape
  }
  const result = op.Shape()
  cleanup()
  return result
}

// Build an oriented cylinder tool and subtract it. Serves both bore types.
// gp_Ax2_3 / BRepPrimAPI_MakeCylinder_3(Axes, R, H) verified against the live
// opencascade.js v1.1.1 kernel (2026-06-27).
export function makeCylinderCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  tool: CylinderToolDescriptor,
): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  const pnt = new O.gp_Pnt_3(tool.basePoint.x, tool.basePoint.y, tool.basePoint.z)
  const dir = new O.gp_Dir_4(tool.dir.x, tool.dir.y, tool.dir.z)
  const ax2 = new O.gp_Ax2_3(pnt, dir)
  const builder = new O.BRepPrimAPI_MakeCylinder_3(ax2, tool.radius, tool.height)
  const toolShape = builder.Shape()
  builder.delete()
  ax2.delete()
  pnt.delete()
  dir.delete()

  // BRepAlgoAPI_Cut_3(S1, S2) runs the boolean in its constructor; Message_ProgressRange
  // is absent in opencascade.js v1.1.1, so the progress-range overloads are unusable.
  const op = new O.BRepAlgoAPI_Cut_3(shape, toolShape)

  const cleanup = () => {
    op.delete()
    toolShape.delete()
  }
  if (!op.IsDone()) {
    console.warn('makeCylinderCut: BRepAlgoAPI_Cut did not complete — returning input shape')
    cleanup()
    return shape
  }
  const result = op.Shape()
  cleanup()
  return result
}

// Build a cylinder from a dowel's dims and fold each cut through a subtraction,
// mirroring makeShape.
export function makeDowelShape(
  oc: OpenCascadeInstance,
  dims: { diameter: number; length: number; cuts: DowelCut[] },
): TopoDS_Shape {
  const sorted = dims.cuts.slice().sort((a, b) => a.id.localeCompare(b.id))
  let current = makeCylinder(oc, dims.diameter / 2, dims.length)
  const dowel = { diameter: dims.diameter, length: dims.length }
  for (const cut of sorted) {
    const prev = current
    switch (cut.kind) {
      case 'end':
        if (cut.angle <= 0 && cut.offset <= 0) continue
        current = makeBoxCutAt(oc, current, computeEndTool(dowel, cut))
        break
      case 'notch':
        if (cut.depth <= 0 || cut.width <= 0) continue
        current = makeBoxCutAt(oc, current, computeNotchTool(dowel, cut))
        break
      case 'bore-axial':
        if (cut.diameter <= 0 || cut.depth <= 0) continue
        current = makeCylinderCut(oc, current, computeAxialBoreTool(dowel, cut))
        break
      case 'bore-transverse':
        if (cut.diameter <= 0 || cut.depth <= 0) continue
        current = makeCylinderCut(oc, current, computeTransverseBoreTool(dowel, cut))
        break
      default: {
        const _exhaustive: never = cut
        throw new Error(`unknown dowel cut kind: ${(_exhaustive as { kind: string }).kind}`)
      }
    }
    if (prev !== current) prev.delete()
  }
  return current
}

export type ExportSpec =
  | {
      kind: 'board'
      label: string
      length: number
      width: number
      thickness: number
      cuts: CutDef[]
      matrix: number[] // column-major 16, from composeWorldMatrix
    }
  | {
      kind: 'cylinder'
      label: string
      diameter: number
      length: number
      cuts: DowelCut[]
      matrix: number[]
    }

// A face's inward drilling direction: the hole is bored INTO the part, so the sign is
// opposite the outward face normal.
function faceDrillAxis(face: Face): { axis: 'x' | 'y' | 'z'; sign: 1 | -1 } {
  switch (face) {
    case '+X':
      return { axis: 'x', sign: -1 }
    case '-X':
      return { axis: 'x', sign: 1 }
    case '+Y':
      return { axis: 'y', sign: -1 }
    case '-Y':
      return { axis: 'y', sign: 1 }
    case '+Z':
      return { axis: 'z', sign: -1 }
    case '-Z':
      return { axis: 'z', sign: 1 }
  }
}

// The in-face axis a row of holes marches along. U is the first non-normal axis in
// x,y,z order; V is the second.
function stepVector(face: Face, rowAxis: 'U' | 'V', pitch: number): Vec3 {
  const normal = faceDrillAxis(face).axis
  const inFace = (['x', 'y', 'z'] as const).filter((a) => a !== normal)
  const axis = rowAxis === 'U' ? inFace[0] : inFace[1]
  return { x: axis === 'x' ? pitch : 0, y: axis === 'y' ? pitch : 0, z: axis === 'z' ? pitch : 0 }
}

// One boolean, not N. A 720 mm side at 32 mm pitch is ~20 holes; two rows per side
// across six cabinets is ~480 subtractions if each hole is its own operation.
// Compounding the cylinders first turns that into one BRepAlgoAPI_Cut per array.
export function makeHoleArrayCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  cut: HoleArrayCut,
): TopoDS_Shape {
  if (cut.count <= 0 || cut.diameter <= 0 || cut.depth <= 0) return shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any

  const { axis: drillAxis, sign } = faceDrillAxis(cut.face)
  const step = stepVector(cut.face, cut.axis, cut.pitch)

  const builder = new O.BRep_Builder()
  const compound = new O.TopoDS_Compound()
  builder.MakeCompound(compound)

  const tools: TopoDS_Shape[] = []
  for (let i = 0; i < cut.count; i++) {
    const dir = new O.gp_Dir_4(
      drillAxis === 'x' ? sign : 0,
      drillAxis === 'y' ? sign : 0,
      drillAxis === 'z' ? sign : 0,
    )
    const origin = new O.gp_Pnt_3(
      cut.start.x + step.x * i,
      cut.start.y + step.y * i,
      cut.start.z + step.z * i,
    )
    const ax2 = new O.gp_Ax2_3(origin, dir)
    const cylinder = new O.BRepPrimAPI_MakeCylinder_3(ax2, cut.diameter / 2, cut.depth)
    const tool: TopoDS_Shape = cylinder.Shape()
    builder.Add(compound, tool)
    tools.push(tool)
    cylinder.delete()
    ax2.delete()
    origin.delete()
    dir.delete()
  }

  // BRepAlgoAPI_Cut_3(S1, S2) runs the boolean in its constructor; Message_ProgressRange
  // is absent in opencascade.js v1.1.1, so the progress-range overloads are unusable.
  const op = new O.BRepAlgoAPI_Cut_3(shape, compound)

  const cleanup = () => {
    op.delete()
    for (const tool of tools) tool.delete()
    compound.delete()
    builder.delete()
  }

  if (!op.IsDone()) {
    console.warn('makeHoleArrayCut: BRepAlgoAPI_Cut did not complete — returning input shape')
    cleanup()
    return shape
  }
  const result = op.Shape()
  cleanup()
  return result
}

export function makeShape(
  oc: OpenCascadeInstance,
  dims: {
    length: number
    width: number
    thickness: number
    cuts: CutDef[]
  },
): TopoDS_Shape {
  const sorted = dims.cuts.slice().sort((a, b) => a.id.localeCompare(b.id))
  let current = makeBox(oc, dims.length, dims.width, dims.thickness)
  for (const cut of sorted) {
    const prev = current
    if (cut.kind === 'box') {
      if (cut.size.x <= 0.1 || cut.size.y <= 0.1 || cut.size.z <= 0.1) continue
      current = makeCut(oc, current, cut.position, cut.size)
    } else if (cut.kind === 'hole-array') {
      current = makeHoleArrayCut(oc, current, cut)
    } else {
      if (cut.angle <= 0) continue
      current = makeMitreCut(oc, current, dims, cut)
    }
    if (prev !== current) prev.delete()
  }
  return current
}

function makeTransformedShape(oc: OpenCascadeInstance, spec: ExportSpec): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  let shape: TopoDS_Shape
  switch (spec.kind) {
    case 'board':
      shape = makeShape(oc, spec)
      break
    case 'cylinder':
      shape = makeDowelShape(oc, { diameter: spec.diameter, length: spec.length, cuts: spec.cuts })
      break
    default: {
      const _exhaustive: never = spec
      throw new Error(`unknown export spec kind: ${(_exhaustive as { kind: string }).kind}`)
    }
  }
  const trsf = new O.gp_Trsf_1()
  // gp_Trsf.SetValues expects row-major 3x4 (a11..a14, a21..a24, a31..a34).
  // spec.matrix is column-major: m[col*4 + row].
  const m = spec.matrix
  trsf.SetValues(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14])
  const xform = new O.BRepBuilderAPI_Transform_2(shape, trsf, false)
  const moved = xform.Shape()
  shape.delete()
  trsf.delete()
  xform.delete()
  return moved
}

// Unnamed-compound STEP. The XCAF/CAF named-solid path is unavailable in
// opencascade.js v1.1.1 — XCAFApp_Application, STEPCAFControl_Writer, and
// Message_ProgressRange are all absent at runtime (live browser spike, 2026-06-16),
// despite appearing in `Supported APIs.md`. We collect every solid into a single
// TopoDS_Compound and emit it with STEPControl_Writer (3-arg Transfer, no progress
// range). Solids are not individually named. See 2026-06-05-3d-export-notes.md
// "Live spike findings".
export function writeStep(oc: OpenCascadeInstance, specs: ExportSpec[]): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  O.Interface_Static.SetCVal('write.step.unit', 'MM')

  const builder = new O.BRep_Builder()
  const compound = new O.TopoDS_Compound()
  builder.MakeCompound(compound)
  const moved: TopoDS_Shape[] = []
  for (const spec of specs) {
    const shape = makeTransformedShape(oc, spec)
    builder.Add(compound, shape)
    moved.push(shape)
  }

  const writer = new O.STEPControl_Writer_1()
  writer.Transfer(compound, O.STEPControl_StepModelType.STEPControl_AsIs, true)
  writer.Write('out.step')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text: string = (oc as any).FS.readFile('out.step', { encoding: 'utf8' })
  for (const s of moved) s.delete()
  compound.delete()
  builder.delete()
  writer.delete()
  return text
}
